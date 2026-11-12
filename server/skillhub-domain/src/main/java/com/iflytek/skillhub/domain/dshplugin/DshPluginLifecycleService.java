package com.iflytek.skillhub.domain.dshplugin;

import com.iflytek.skillhub.domain.namespace.NamespaceRole;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.domain.shared.exception.DomainForbiddenException;
import com.iflytek.skillhub.storage.ObjectStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Owns post-publication lifecycle invariants for hosted DSH plugins. */
@Service
public class DshPluginLifecycleService {

    private static final Logger log = LoggerFactory.getLogger(DshPluginLifecycleService.class);

    private final DshPluginRepository pluginRepository;
    private final DshPluginVersionRepository versionRepository;
    private final ObjectStorageService objectStorageService;
    private final DshPluginAuthorization authorization;
    private final Clock clock;

    public DshPluginLifecycleService(DshPluginRepository pluginRepository,
                                     DshPluginVersionRepository versionRepository,
                                     ObjectStorageService objectStorageService,
                                     DshPluginAuthorization authorization,
                                     Clock clock) {
        this.pluginRepository = pluginRepository;
        this.versionRepository = versionRepository;
        this.objectStorageService = objectStorageService;
        this.authorization = authorization;
        this.clock = clock;
    }

    @Transactional
    public DshPlugin updateMetadata(DshPlugin plugin,
                                    DshPluginMetadata metadata,
                                    String actor,
                                    Map<Long, NamespaceRole> namespaceRoles,
                                    Set<String> platformRoles) {
        assertManage(plugin, actor, namespaceRoles, platformRoles);
        plugin.applyMetadata(
                metadata.displayName(),
                metadata.summary(),
                metadata.description(),
                metadata.homepage(),
                metadata.license(),
                metadata.category(),
                metadata.tags(),
                actor);
        return pluginRepository.save(plugin);
    }

    @Transactional
    public DshPluginVersion yank(DshPlugin plugin,
                                 DshPluginVersion version,
                                 String reason,
                                 String actor,
                                 Map<Long, NamespaceRole> namespaceRoles,
                                 Set<String> platformRoles) {
        assertManage(plugin, actor, namespaceRoles, platformRoles);
        if (version.getStatus() == DshPluginVersionStatus.YANKED) {
            return version;
        }
        version.yank(actor, normalizeReason(reason), Instant.now(clock));
        DshPluginVersion saved = versionRepository.save(version);
        if (version.getId().equals(plugin.getLatestVersionId())) {
            plugin.setLatestVersionId(nextPublishedVersionId(plugin.getId(), version.getId()));
            pluginRepository.save(plugin);
        }
        return saved;
    }

    @Transactional
    public DshPluginVersion unyank(DshPlugin plugin,
                                   DshPluginVersion version,
                                   String actor,
                                   Map<Long, NamespaceRole> namespaceRoles,
                                   Set<String> platformRoles) {
        assertManage(plugin, actor, namespaceRoles, platformRoles);
        if (version.isPublished()) {
            return version;
        }
        version.unyank();
        DshPluginVersion saved = versionRepository.save(version);
        if (plugin.getLatestVersionId() == null) {
            plugin.setLatestVersionId(version.getId());
            pluginRepository.save(plugin);
        }
        return saved;
    }

    @Transactional
    public DshPlugin recommend(DshPlugin plugin,
                               DshPluginVersion version,
                               String actor,
                               Map<Long, NamespaceRole> namespaceRoles,
                               Set<String> platformRoles) {
        assertManage(plugin, actor, namespaceRoles, platformRoles);
        if (!version.isPublished()) {
            throw new DomainBadRequestException("error.dsh.plugin.version.notPublished");
        }
        plugin.setLatestVersionId(version.getId());
        return pluginRepository.save(plugin);
    }

    @Transactional
    public void deleteVersion(DshPlugin plugin,
                              DshPluginVersion version,
                              String actor,
                              Map<Long, NamespaceRole> namespaceRoles,
                              Set<String> platformRoles) {
        assertManage(plugin, actor, namespaceRoles, platformRoles);
        if (version.getId().equals(plugin.getLatestVersionId())) {
            plugin.setLatestVersionId(nextPublishedVersionId(plugin.getId(), version.getId()));
            pluginRepository.save(plugin);
            pluginRepository.flush();
        }
        versionRepository.delete(version);
        versionRepository.flush();
        deleteObjectAfterCommit(version.getTarballKey());
    }

    @Transactional
    public DshPlugin setHidden(DshPlugin plugin,
                               boolean hidden,
                               String actor,
                               Map<Long, NamespaceRole> namespaceRoles,
                               Set<String> platformRoles) {
        assertManage(plugin, actor, namespaceRoles, platformRoles);
        if (hidden) {
            plugin.hide(actor, Instant.now(clock));
        } else {
            plugin.restore(actor);
        }
        return pluginRepository.save(plugin);
    }

    public void assertManage(DshPlugin plugin,
                             String actor,
                             Map<Long, NamespaceRole> namespaceRoles,
                             Set<String> platformRoles) {
        if (!authorization.canManage(plugin, actor, namespaceRoles, platformRoles)) {
            throw new DomainForbiddenException("error.dsh.plugin.forbidden");
        }
    }

    private Long nextPublishedVersionId(Long pluginId, Long excludedVersionId) {
        List<DshPluginVersion> published = versionRepository
                .findByPluginIdAndStatusOrderByPublishedAtDesc(pluginId, DshPluginVersionStatus.PUBLISHED);
        return published.stream()
                .map(DshPluginVersion::getId)
                .filter(id -> !id.equals(excludedVersionId))
                .findFirst()
                .orElse(null);
    }

    private String normalizeReason(String reason) {
        if (reason == null) {
            return null;
        }
        String trimmed = reason.trim();
        if (trimmed.length() > 2000) {
            throw new DomainBadRequestException("error.dsh.plugin.yank.reason.tooLong", 2000);
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void deleteObjectAfterCommit(String tarballKey) {
        if (tarballKey == null || tarballKey.isBlank()) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            deleteObject(tarballKey);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteObject(tarballKey);
            }
        });
    }

    private void deleteObject(String tarballKey) {
        try {
            objectStorageService.deleteObjects(List.of(tarballKey));
        } catch (RuntimeException exception) {
            log.error("Failed to delete DSH plugin tarball after commit [key={}]", tarballKey, exception);
        }
    }
}
