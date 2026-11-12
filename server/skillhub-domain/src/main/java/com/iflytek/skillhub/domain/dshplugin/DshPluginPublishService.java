package com.iflytek.skillhub.domain.dshplugin;

import com.iflytek.skillhub.domain.namespace.Namespace;
import com.iflytek.skillhub.domain.namespace.NamespaceMemberRepository;
import com.iflytek.skillhub.domain.namespace.NamespaceRepository;
import com.iflytek.skillhub.domain.namespace.NamespaceRole;
import com.iflytek.skillhub.domain.namespace.NamespaceStatus;
import com.iflytek.skillhub.domain.namespace.SlugValidator;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.domain.shared.exception.DomainForbiddenException;
import com.iflytek.skillhub.storage.ObjectStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Publishes one validated DSH plugin tarball.
 *
 * <p>The npm package name owns a single namespace in the registry. A new
 * version may only be added by the plugin creator, a namespace owner/admin, or
 * a platform admin, so an unrelated namespace cannot take over an installed
 * package coordinate.
 */
@Service
public class DshPluginPublishService {

    private static final Logger log = LoggerFactory.getLogger(DshPluginPublishService.class);
    private static final int MAX_COMPAT_NOTE = 500;
    private static final int MAX_RELEASE_NOTES = 20_000;

    private final NamespaceRepository namespaceRepository;
    private final NamespaceMemberRepository namespaceMemberRepository;
    private final DshPluginRepository pluginRepository;
    private final DshPluginVersionRepository versionRepository;
    private final ObjectStorageService objectStorageService;
    private final DshPluginAuthorization authorization;

    public DshPluginPublishService(NamespaceRepository namespaceRepository,
                                   NamespaceMemberRepository namespaceMemberRepository,
                                   DshPluginRepository pluginRepository,
                                   DshPluginVersionRepository versionRepository,
                                   ObjectStorageService objectStorageService,
                                   DshPluginAuthorization authorization) {
        this.namespaceRepository = namespaceRepository;
        this.namespaceMemberRepository = namespaceMemberRepository;
        this.pluginRepository = pluginRepository;
        this.versionRepository = versionRepository;
        this.objectStorageService = objectStorageService;
        this.authorization = authorization;
    }

    public record PublishResult(DshPlugin plugin, DshPluginVersion version, boolean newPlugin) {
    }

    @Transactional
    public PublishResult publish(String namespaceSlug,
                                 Path packageFile,
                                 long sizeBytes,
                                 String sha256,
                                 DshPluginPackage packageInfo,
                                 DshPluginMetadata metadata,
                                 String compatNote,
                                 String releaseNotes,
                                 String actor,
                                 Map<Long, NamespaceRole> namespaceRoles,
                                 Set<String> platformRoles) {
        Namespace namespace = namespaceRepository.findBySlug(namespaceSlug)
                .orElseThrow(() -> new DomainBadRequestException("error.namespace.slug.notFound", namespaceSlug));
        if (namespace.getStatus() != NamespaceStatus.ACTIVE) {
            throw new DomainBadRequestException("error.dsh.plugin.namespace.inactive", namespaceSlug);
        }
        NamespaceRole memberRole = namespaceMemberRepository
                .findByNamespaceIdAndUserId(namespace.getId(), actor)
                .map(member -> member.getRole())
                .orElse(null);
        if (!authorization.canPublish(namespace, memberRole, platformRoles)) {
            throw new DomainForbiddenException("error.dsh.plugin.publish.notMember", namespaceSlug);
        }

        String trimmedPackageName = packageInfo.packageName();
        DshPlugin plugin = pluginRepository.findByPackageName(trimmedPackageName).orElse(null);
        boolean newPlugin = plugin == null;

        if (!newPlugin) {
            if (!plugin.getNamespaceId().equals(namespace.getId())) {
                throw new DomainBadRequestException(
                        "error.dsh.plugin.package.ownedElsewhere", trimmedPackageName);
            }
            if (plugin.getStatus() != DshPluginStatus.ACTIVE) {
                throw new DomainBadRequestException("error.dsh.plugin.archived", plugin.getSlug());
            }
            if (!authorization.canManage(plugin, actor, namespaceRoles, platformRoles)) {
                throw new DomainForbiddenException("error.dsh.plugin.forbidden");
            }
            if (versionRepository.findByPluginIdAndVersion(plugin.getId(), packageInfo.version()).isPresent()) {
                throw new DomainBadRequestException(
                        "error.dsh.plugin.version.exists", packageInfo.version());
            }
        }

        DshPluginMetadata effective = effectiveMetadata(newPlugin ? null : plugin, packageInfo, metadata);

        if (newPlugin) {
            String slug = slugFor(trimmedPackageName);
            if (pluginRepository.findByNamespaceIdAndSlug(namespace.getId(), slug).isPresent()) {
                throw new DomainBadRequestException("error.dsh.plugin.slug.conflict", slug);
            }
            plugin = new DshPlugin(
                    namespace.getId(), slug, trimmedPackageName, effective.displayName(), actor);
            plugin.applyMetadata(
                    effective.displayName(),
                    effective.summary(),
                    effective.description(),
                    effective.homepage(),
                    effective.license(),
                    effective.category(),
                    effective.tags(),
                    actor);
            try {
                plugin = pluginRepository.save(plugin);
                pluginRepository.flush();
            } catch (DataIntegrityViolationException exception) {
                throw new DomainBadRequestException(
                        "error.dsh.plugin.package.ownedElsewhere", trimmedPackageName);
            }
        } else {
            plugin.applyMetadata(
                    effective.displayName(),
                    effective.summary(),
                    effective.description(),
                    effective.homepage(),
                    effective.license(),
                    effective.category(),
                    effective.tags(),
                    actor);
        }

        String tarballKey = tarballKey(plugin.getId(), packageInfo.version());
        DshPluginVersion version = new DshPluginVersion(
                plugin.getId(),
                packageInfo.version(),
                tarballKey,
                sha256,
                sizeBytes,
                packageInfo.manifestJson(),
                actor);
        version.setCompatNote(normalizeNote(compatNote, MAX_COMPAT_NOTE, "error.dsh.plugin.compatNote.tooLong"));
        version.setReleaseNotes(normalizeNote(releaseNotes, MAX_RELEASE_NOTES, "error.dsh.plugin.releaseNotes.tooLong"));

        try {
            version = versionRepository.save(version);
            versionRepository.flush();
        } catch (DataIntegrityViolationException exception) {
            throw new DomainBadRequestException(
                    "error.dsh.plugin.version.exists", packageInfo.version());
        }

        registerRollbackCleanup(tarballKey);
        try (InputStream input = Files.newInputStream(packageFile)) {
            objectStorageService.putObject(tarballKey, input, sizeBytes, "application/gzip");
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read staged DSH plugin tarball", exception);
        }

        plugin.setLatestVersionId(version.getId());
        plugin = pluginRepository.save(plugin);
        return new PublishResult(plugin, version, newPlugin);
    }

    private DshPluginMetadata effectiveMetadata(DshPlugin existing,
                                                DshPluginPackage packageInfo,
                                                DshPluginMetadata requested) {
        if (existing != null) {
            return requested;
        }
        String fallbackDisplayName = lastSegment(packageInfo.packageName());
        return new DshPluginMetadata(
                requested.displayName() != null ? requested.displayName() : fallbackDisplayName,
                requested.summary() != null ? requested.summary() : packageInfo.description(),
                requested.description() != null ? requested.description() : packageInfo.description(),
                requested.homepage() != null ? requested.homepage() : packageInfo.homepage(),
                requested.license() != null ? requested.license() : packageInfo.license(),
                requested.category(),
                requested.tags() != null ? requested.tags() : List.of());
    }

    /**
     * Derives the URL slug from the package name. Registry slugs are limited to
     * 64 characters, so an unusually long npm name is truncated and, when that
     * would produce a reserved or invalid slug, suffixed with {@code -plugin}.
     */
    static String slugFor(String packageName) {
        String base = SlugValidator.normalize(lastSegment(packageName));
        if (base.length() > 57) {
            base = base.substring(0, 57).replaceAll("-+$", "");
        }
        if (base.length() < 2) {
            base = "plugin";
        }
        if (!SlugValidator.isValid(base)) {
            base = base + "-plugin";
        }
        if (!SlugValidator.isValid(base)) {
            throw new DomainBadRequestException("error.dsh.plugin.slug.conflict", base);
        }
        return base;
    }

    private static String lastSegment(String packageName) {
        int slash = packageName.lastIndexOf('/');
        return slash >= 0 ? packageName.substring(slash + 1) : packageName;
    }

    private String tarballKey(Long pluginId, String version) {
        return String.format("dsh-plugins/%d/%s/package.tgz", pluginId, version);
    }

    private String normalizeNote(String value, int max, String errorCode) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() > max) {
            throw new DomainBadRequestException(errorCode, max);
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void registerRollbackCleanup(String tarballKey) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED) {
                    return;
                }
                try {
                    objectStorageService.deleteObjects(List.of(tarballKey));
                } catch (RuntimeException exception) {
                    log.warn("Failed to clean rolled-back DSH plugin tarball [key={}]", tarballKey, exception);
                }
            }
        });
    }
}
