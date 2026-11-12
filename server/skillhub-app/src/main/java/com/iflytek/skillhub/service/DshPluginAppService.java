package com.iflytek.skillhub.service;

import com.iflytek.skillhub.config.DshPluginProperties;
import com.iflytek.skillhub.domain.audit.AuditDetail;
import com.iflytek.skillhub.domain.audit.AuditLogService;
import com.iflytek.skillhub.domain.dshplugin.DshPlugin;
import com.iflytek.skillhub.domain.dshplugin.DshPluginAction;
import com.iflytek.skillhub.domain.dshplugin.DshPluginAuthorization;
import com.iflytek.skillhub.domain.dshplugin.DshPluginLifecycleService;
import com.iflytek.skillhub.domain.dshplugin.DshPluginMetadata;
import com.iflytek.skillhub.domain.dshplugin.DshPluginPackage;
import com.iflytek.skillhub.domain.dshplugin.DshPluginPackageParser;
import com.iflytek.skillhub.domain.dshplugin.DshPluginPublishService;
import com.iflytek.skillhub.domain.dshplugin.DshPluginRepository;
import com.iflytek.skillhub.domain.dshplugin.DshPluginStatus;
import com.iflytek.skillhub.domain.dshplugin.DshPluginVersion;
import com.iflytek.skillhub.domain.dshplugin.DshPluginVersionRepository;
import com.iflytek.skillhub.domain.dshplugin.DshPluginVersionStatus;
import com.iflytek.skillhub.domain.namespace.Namespace;
import com.iflytek.skillhub.domain.namespace.NamespaceMemberRepository;
import com.iflytek.skillhub.domain.namespace.NamespaceRepository;
import com.iflytek.skillhub.domain.namespace.NamespaceRole;
import com.iflytek.skillhub.domain.namespace.NamespaceStatus;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.domain.shared.exception.DomainForbiddenException;
import com.iflytek.skillhub.domain.shared.exception.DomainNotFoundException;
import com.iflytek.skillhub.dto.DshPluginCategoryResponse;
import com.iflytek.skillhub.dto.DshPluginDetailResponse;
import com.iflytek.skillhub.dto.DshPluginPackagePreviewResponse;
import com.iflytek.skillhub.dto.DshPluginPublishResponse;
import com.iflytek.skillhub.dto.DshPluginSummaryResponse;
import com.iflytek.skillhub.dto.DshPluginUpdateRequest;
import com.iflytek.skillhub.dto.DshPluginVersionResponse;
import com.iflytek.skillhub.dto.PageResponse;
import com.iflytek.skillhub.repository.DshPluginQueryRepository;
import com.iflytek.skillhub.storage.ObjectStorageService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Application service for hosted DSH plugins.
 *
 * <p>Transport controllers only shape requests. This service resolves namespace
 * authorization, stages and hashes the uploaded tarball, delegates publication
 * and lifecycle invariants to the domain, records the audit trail, and serves
 * the catalog read model.
 */
@Service
public class DshPluginAppService {

    private static final int MAX_TAGS = 10;

    private final DshPluginProperties properties;
    private final NamespaceRepository namespaceRepository;
    private final NamespaceMemberRepository namespaceMemberRepository;
    private final DshPluginRepository pluginRepository;
    private final DshPluginVersionRepository versionRepository;
    private final DshPluginPublishService publishService;
    private final DshPluginLifecycleService lifecycleService;
    private final DshPluginAuthorization authorization;
    private final DshPluginQueryRepository queryRepository;
    private final ObjectStorageService objectStorageService;
    private final AuditLogService auditLogService;

    public DshPluginAppService(DshPluginProperties properties,
                               NamespaceRepository namespaceRepository,
                               NamespaceMemberRepository namespaceMemberRepository,
                               DshPluginRepository pluginRepository,
                               DshPluginVersionRepository versionRepository,
                               DshPluginPublishService publishService,
                               DshPluginLifecycleService lifecycleService,
                               DshPluginAuthorization authorization,
                               DshPluginQueryRepository queryRepository,
                               ObjectStorageService objectStorageService,
                               AuditLogService auditLogService) {
        this.properties = properties;
        this.namespaceRepository = namespaceRepository;
        this.namespaceMemberRepository = namespaceMemberRepository;
        this.pluginRepository = pluginRepository;
        this.versionRepository = versionRepository;
        this.publishService = publishService;
        this.lifecycleService = lifecycleService;
        this.authorization = authorization;
        this.queryRepository = queryRepository;
        this.objectStorageService = objectStorageService;
        this.auditLogService = auditLogService;
    }

    public record PublishForm(
            String displayName,
            String summary,
            String description,
            String homepage,
            String license,
            String category,
            List<String> tags,
            String compatNote,
            String releaseNotes
    ) {
        public static PublishForm empty() {
            return new PublishForm(null, null, null, null, null, null, List.of(), null, null);
        }
    }

    public record DownloadResult(
            InputStream content,
            String filename,
            String contentType,
            long contentLength,
            String sha256
    ) {
    }

    private record StagedTarball(Path path, long size, String sha256) {
    }

    public PageResponse<DshPluginSummaryResponse> search(String query,
                                                         String category,
                                                         String tag,
                                                         String sort,
                                                         int page,
                                                         int size) {
        int normalizedPage = Math.max(0, page);
        int normalizedSize = Math.min(Math.max(1, size), 100);
        return queryRepository.search(query, category, tag, sort, normalizedPage, normalizedSize);
    }

    public List<DshPluginCategoryResponse> categories() {
        return queryRepository.categories();
    }

    public PageResponse<DshPluginSummaryResponse> mine(String userId,
                                                       String query,
                                                       int page,
                                                       int size,
                                                       Map<Long, NamespaceRole> namespaceRoles) {
        int normalizedPage = Math.max(0, page);
        int normalizedSize = Math.min(Math.max(1, size), 100);
        return queryRepository.findMine(
                userId, adminNamespaceIds(namespaceRoles), query, normalizedPage, normalizedSize);
    }

    public DshPluginDetailResponse detail(String namespaceSlug,
                                          String slug,
                                          String userId,
                                          Map<Long, NamespaceRole> namespaceRoles,
                                          Set<String> platformRoles) {
        DshPluginDetailResponse row = queryRepository.findDetail(namespaceSlug, slug)
                .orElseThrow(() -> new DomainNotFoundException(
                        "error.dsh.plugin.notFound", namespaceSlug + "/" + slug));
        boolean manageable = authorization.canManage(
                row.namespaceId(), row.createdBy(), userId, safeRoles(namespaceRoles), platformRoles);
        if ((row.hidden() || !"ACTIVE".equals(row.status())) && !manageable) {
            throw new DomainNotFoundException("error.dsh.plugin.notFound", namespaceSlug + "/" + slug);
        }
        List<DshPluginVersionResponse> versions = queryRepository.findVersions(row.id(), row.latestVersionId());
        return new DshPluginDetailResponse(
                row.id(), row.namespaceId(), row.namespace(), row.namespaceDisplayName(), row.slug(),
                row.packageName(), row.displayName(), row.summary(), row.description(), row.homepage(),
                row.license(), row.category(), row.tags(), row.status(), row.hidden(),
                row.latestVersionId(), row.latestVersion(), row.downloadCount(), row.createdBy(),
                row.createdByName(), row.createdAt(), row.updatedAt(),
                manageable ? allowedActions(row.hidden(), row.status(), versions) : Set.of(),
                versions);
    }

    public DshPluginPackagePreviewResponse preview(String namespaceSlug,
                                                   MultipartFile file,
                                                   String actor,
                                                   Map<Long, NamespaceRole> namespaceRoles,
                                                   Set<String> platformRoles) {
        requirePublishableNamespace(namespaceSlug, actor, platformRoles);
        StagedTarball staged = stage(file);
        try {
            DshPluginPackage packageInfo = parse(staged.path());
            DshPlugin existing = pluginRepository.findByPackageName(packageInfo.packageName()).orElse(null);
            String existingNamespace = null;
            String existingSlug = null;
            boolean versionExists = false;
            if (existing != null) {
                Namespace namespace = namespaceRepository.findById(existing.getNamespaceId()).orElse(null);
                existingNamespace = namespace == null ? null : namespace.getSlug();
                existingSlug = existing.getSlug();
                versionExists = versionRepository
                        .findByPluginIdAndVersion(existing.getId(), packageInfo.version())
                        .isPresent();
            }
            return new DshPluginPackagePreviewResponse(
                    packageInfo.packageName(),
                    packageInfo.version(),
                    packageInfo.description(),
                    packageInfo.license(),
                    packageInfo.homepage(),
                    packageInfo.engines(),
                    packageInfo.peerDependencies(),
                    packageInfo.capabilities(),
                    existing == null,
                    existingNamespace,
                    existingSlug,
                    versionExists);
        } finally {
            deleteTemporary(staged.path());
        }
    }

    @Transactional
    public DshPluginPublishResponse publish(String namespaceSlug,
                                            MultipartFile file,
                                            PublishForm form,
                                            String actor,
                                            Map<Long, NamespaceRole> namespaceRoles,
                                            Set<String> platformRoles,
                                            AuditRequestContext auditContext) {
        requirePublishableNamespace(namespaceSlug, actor, platformRoles);
        StagedTarball staged = stage(file);
        try {
            DshPluginPackage packageInfo = parse(staged.path());
            DshPluginPublishService.PublishResult result = publishService.publish(
                    namespaceSlug,
                    staged.path(),
                    staged.size(),
                    staged.sha256(),
                    packageInfo,
                    toMetadata(form),
                    form.compatNote(),
                    form.releaseNotes(),
                    actor,
                    safeRoles(namespaceRoles),
                    platformRoles);

            auditLogService.record(
                    actor,
                    "DSH_PLUGIN_PUBLISH",
                    "DSH_PLUGIN",
                    result.plugin().getId(),
                    null,
                    auditContext == null ? null : auditContext.clientIp(),
                    auditContext == null ? null : auditContext.userAgent(),
                    AuditDetail.of(
                            "packageName", packageInfo.packageName(),
                            "version", packageInfo.version()));

            return new DshPluginPublishResponse(
                    result.plugin().getId(),
                    namespaceSlug,
                    result.plugin().getSlug(),
                    result.plugin().getPackageName(),
                    result.version().getVersion(),
                    result.version().getStatus().name(),
                    result.newPlugin());
        } finally {
            deleteTemporary(staged.path());
        }
    }

    @Transactional
    public DshPluginDetailResponse updateMetadata(Long pluginId,
                                                  DshPluginUpdateRequest request,
                                                  String actor,
                                                  Map<Long, NamespaceRole> namespaceRoles,
                                                  Set<String> platformRoles,
                                                  AuditRequestContext auditContext) {
        DshPlugin plugin = requirePlugin(pluginId);
        DshPluginMetadata metadata = new DshPluginMetadata(
                request.displayName(),
                request.summary(),
                request.description(),
                request.homepage(),
                request.license(),
                request.category(),
                request.tags());
        lifecycleService.updateMetadata(plugin, metadata, actor, safeRoles(namespaceRoles), platformRoles);
        pluginRepository.flush();
        audit(actor, "DSH_PLUGIN_UPDATE", pluginId, auditContext,
                AuditDetail.of("packageName", plugin.getPackageName()));
        return detailOf(plugin, actor, namespaceRoles, platformRoles);
    }

    @Transactional
    public DshPluginDetailResponse yankVersion(Long pluginId,
                                               Long versionId,
                                               String reason,
                                               String actor,
                                               Map<Long, NamespaceRole> namespaceRoles,
                                               Set<String> platformRoles,
                                               AuditRequestContext auditContext) {
        DshPlugin plugin = requirePlugin(pluginId);
        DshPluginVersion version = requireVersion(pluginId, versionId);
        lifecycleService.yank(plugin, version, reason, actor, safeRoles(namespaceRoles), platformRoles);
        pluginRepository.flush();
        versionRepository.flush();
        audit(actor, "DSH_PLUGIN_VERSION_YANK", pluginId, auditContext,
                AuditDetail.of("version", version.getVersion()));
        return detailOf(plugin, actor, namespaceRoles, platformRoles);
    }

    @Transactional
    public DshPluginDetailResponse unyankVersion(Long pluginId,
                                                 Long versionId,
                                                 String actor,
                                                 Map<Long, NamespaceRole> namespaceRoles,
                                                 Set<String> platformRoles,
                                                 AuditRequestContext auditContext) {
        DshPlugin plugin = requirePlugin(pluginId);
        DshPluginVersion version = requireVersion(pluginId, versionId);
        lifecycleService.unyank(plugin, version, actor, safeRoles(namespaceRoles), platformRoles);
        pluginRepository.flush();
        versionRepository.flush();
        audit(actor, "DSH_PLUGIN_VERSION_UNYANK", pluginId, auditContext,
                AuditDetail.of("version", version.getVersion()));
        return detailOf(plugin, actor, namespaceRoles, platformRoles);
    }

    @Transactional
    public DshPluginDetailResponse recommendVersion(Long pluginId,
                                                    Long versionId,
                                                    String actor,
                                                    Map<Long, NamespaceRole> namespaceRoles,
                                                    Set<String> platformRoles,
                                                    AuditRequestContext auditContext) {
        DshPlugin plugin = requirePlugin(pluginId);
        DshPluginVersion version = requireVersion(pluginId, versionId);
        lifecycleService.recommend(plugin, version, actor, safeRoles(namespaceRoles), platformRoles);
        pluginRepository.flush();
        audit(actor, "DSH_PLUGIN_VERSION_RECOMMEND", pluginId, auditContext,
                AuditDetail.of("version", version.getVersion()));
        return detailOf(plugin, actor, namespaceRoles, platformRoles);
    }

    @Transactional
    public DshPluginDetailResponse deleteVersion(Long pluginId,
                                                 Long versionId,
                                                 String actor,
                                                 Map<Long, NamespaceRole> namespaceRoles,
                                                 Set<String> platformRoles,
                                                 AuditRequestContext auditContext) {
        DshPlugin plugin = requirePlugin(pluginId);
        DshPluginVersion version = requireVersion(pluginId, versionId);
        String deletedVersion = version.getVersion();
        lifecycleService.deleteVersion(plugin, version, actor, safeRoles(namespaceRoles), platformRoles);
        pluginRepository.flush();
        audit(actor, "DSH_PLUGIN_VERSION_DELETE", pluginId, auditContext,
                AuditDetail.of("version", deletedVersion));
        return detailOf(plugin, actor, namespaceRoles, platformRoles);
    }

    @Transactional
    public DshPluginDetailResponse setHidden(Long pluginId,
                                             boolean hidden,
                                             String actor,
                                             Map<Long, NamespaceRole> namespaceRoles,
                                             Set<String> platformRoles,
                                             AuditRequestContext auditContext) {
        DshPlugin plugin = requirePlugin(pluginId);
        lifecycleService.setHidden(plugin, hidden, actor, safeRoles(namespaceRoles), platformRoles);
        pluginRepository.flush();
        audit(actor, hidden ? "DSH_PLUGIN_HIDE" : "DSH_PLUGIN_RESTORE", pluginId, auditContext,
                AuditDetail.of("packageName", plugin.getPackageName()));
        return detailOf(plugin, actor, namespaceRoles, platformRoles);
    }

    public DownloadResult download(String namespaceSlug,
                                   String slug,
                                   String versionValue,
                                   String userId,
                                   Map<Long, NamespaceRole> namespaceRoles,
                                   Set<String> platformRoles) {
        Namespace namespace = namespaceRepository.findBySlug(namespaceSlug)
                .orElseThrow(() -> new DomainNotFoundException(
                        "error.dsh.plugin.notFound", namespaceSlug + "/" + slug));
        DshPlugin plugin = pluginRepository.findByNamespaceIdAndSlug(namespace.getId(), slug)
                .orElseThrow(() -> new DomainNotFoundException(
                        "error.dsh.plugin.notFound", namespaceSlug + "/" + slug));

        boolean manageable = authorization.canManage(
                plugin, userId, safeRoles(namespaceRoles), platformRoles);
        if ((plugin.isHidden() || plugin.getStatus() != DshPluginStatus.ACTIVE) && !manageable) {
            throw new DomainNotFoundException("error.dsh.plugin.notFound", namespaceSlug + "/" + slug);
        }

        DshPluginVersion version;
        if (versionValue == null || versionValue.isBlank()) {
            if (plugin.getLatestVersionId() == null) {
                throw new DomainNotFoundException("error.dsh.plugin.version.notFound", "latest");
            }
            version = versionRepository.findById(plugin.getLatestVersionId())
                    .orElseThrow(() -> new DomainNotFoundException(
                            "error.dsh.plugin.version.notFound", "latest"));
        } else {
            version = versionRepository.findByPluginIdAndVersion(plugin.getId(), versionValue)
                    .orElseThrow(() -> new DomainNotFoundException(
                            "error.dsh.plugin.version.notFound", versionValue));
        }
        if (version.getStatus() == DshPluginVersionStatus.YANKED && !manageable) {
            throw new DomainNotFoundException("error.dsh.plugin.version.notFound", version.getVersion());
        }
        if (!objectStorageService.exists(version.getTarballKey())) {
            throw new DomainNotFoundException("error.dsh.plugin.tarball.missing", version.getVersion());
        }

        pluginRepository.incrementDownloadCount(plugin.getId());
        versionRepository.incrementDownloadCount(version.getId());

        String filename = downloadableFilename(plugin.getPackageName(), version.getVersion());
        return new DownloadResult(
                objectStorageService.getObject(version.getTarballKey()),
                filename,
                "application/gzip",
                version.getSizeBytes(),
                version.getSha256());
    }

    private Set<DshPluginAction> allowedActions(boolean hidden,
                                                String status,
                                                List<DshPluginVersionResponse> versions) {
        Set<DshPluginAction> actions = EnumSet.of(
                DshPluginAction.UPDATE_METADATA,
                hidden ? DshPluginAction.RESTORE : DshPluginAction.HIDE);
        if (!"ARCHIVED".equals(status)) {
            actions.add(DshPluginAction.PUBLISH_VERSION);
        }
        if (!versions.isEmpty()) {
            actions.add(DshPluginAction.YANK_VERSION);
            actions.add(DshPluginAction.UNYANK_VERSION);
            actions.add(DshPluginAction.DELETE_VERSION);
            actions.add(DshPluginAction.RECOMMEND_VERSION);
        }
        return actions;
    }

    private DshPluginDetailResponse detailOf(DshPlugin plugin,
                                             String actor,
                                             Map<Long, NamespaceRole> namespaceRoles,
                                             Set<String> platformRoles) {
        Namespace namespace = namespaceRepository.findById(plugin.getNamespaceId())
                .orElseThrow(() -> new DomainNotFoundException("error.namespace.notFound", plugin.getNamespaceId()));
        return detail(namespace.getSlug(), plugin.getSlug(), actor, namespaceRoles, platformRoles);
    }

    private Namespace requirePublishableNamespace(String namespaceSlug,
                                                  String actor,
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
        return namespace;
    }

    private DshPlugin requirePlugin(Long pluginId) {
        return pluginRepository.findById(pluginId)
                .orElseThrow(() -> new DomainNotFoundException("error.dsh.plugin.notFound", pluginId));
    }

    private DshPluginVersion requireVersion(Long pluginId, Long versionId) {
        DshPluginVersion version = versionRepository.findById(versionId)
                .orElseThrow(() -> new DomainNotFoundException("error.dsh.plugin.version.notFound", versionId));
        if (!version.getPluginId().equals(pluginId)) {
            throw new DomainNotFoundException("error.dsh.plugin.version.notFound", versionId);
        }
        return version;
    }

    private StagedTarball stage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new DomainBadRequestException("error.dsh.plugin.package.empty");
        }
        if (file.getSize() > properties.getMaxPackageSize()) {
            throw new DomainBadRequestException(
                    "error.dsh.plugin.package.tooLarge", properties.getMaxPackageSize());
        }
        Path temporary = null;
        try {
            temporary = Files.createTempFile("skillhub-dsh-plugin-", ".tgz");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long total = 0;
            try (InputStream input = file.getInputStream();
                 OutputStream output = Files.newOutputStream(temporary)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > properties.getMaxPackageSize()) {
                        throw new DomainBadRequestException(
                                "error.dsh.plugin.package.tooLarge", properties.getMaxPackageSize());
                    }
                    digest.update(buffer, 0, read);
                    output.write(buffer, 0, read);
                }
            }
            if (total == 0) {
                throw new DomainBadRequestException("error.dsh.plugin.package.empty");
            }
            return new StagedTarball(temporary, total, HexFormat.of().formatHex(digest.digest()));
        } catch (IOException exception) {
            deleteTemporary(temporary);
            throw new IllegalStateException("Failed to stage DSH plugin upload", exception);
        } catch (NoSuchAlgorithmException exception) {
            deleteTemporary(temporary);
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        } catch (RuntimeException exception) {
            deleteTemporary(temporary);
            throw exception;
        }
    }

    private DshPluginPackage parse(Path tarball) {
        return DshPluginPackageParser.parse(tarball, new DshPluginPackageParser.Limits(
                properties.getMaxPackageSize(),
                properties.getMaxUncompressedSize(),
                properties.getMaxManifestSize(),
                properties.getMaxEntries()));
    }

    private DshPluginMetadata toMetadata(PublishForm form) {
        // An absent tag list means "keep the current tags" on an existing plugin;
        // a brand-new plugin falls back to an empty list in the publish service.
        List<String> tags = form.tags() == null || form.tags().isEmpty() ? null : form.tags();
        if (tags != null && tags.size() > MAX_TAGS) {
            throw new DomainBadRequestException("error.dsh.plugin.tags.tooMany", MAX_TAGS);
        }
        return new DshPluginMetadata(
                form.displayName(),
                form.summary(),
                form.description(),
                form.homepage(),
                form.license(),
                form.category(),
                tags);
    }

    private Set<Long> adminNamespaceIds(Map<Long, NamespaceRole> namespaceRoles) {
        if (namespaceRoles == null || namespaceRoles.isEmpty()) {
            return Set.of();
        }
        Set<Long> ids = new HashSet<>();
        namespaceRoles.forEach((namespaceId, role) -> {
            if (role == NamespaceRole.OWNER || role == NamespaceRole.ADMIN) {
                ids.add(namespaceId);
            }
        });
        return ids;
    }

    private Map<Long, NamespaceRole> safeRoles(Map<Long, NamespaceRole> namespaceRoles) {
        return namespaceRoles == null ? Map.of() : namespaceRoles;
    }

    private void audit(String actor,
                       String action,
                       Long pluginId,
                       AuditRequestContext context,
                       String detailJson) {
        auditLogService.record(
                actor,
                action,
                "DSH_PLUGIN",
                pluginId,
                null,
                context == null ? null : context.clientIp(),
                context == null ? null : context.userAgent(),
                detailJson);
    }

    private String downloadableFilename(String packageName, String version) {
        String base = packageName.startsWith("@")
                ? packageName.substring(1).replace('/', '-')
                : packageName;
        return base + "-" + version + ".tgz";
    }

    private void deleteTemporary(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // The OS temp area is cleaned on restart; a failed delete must not fail the request.
        }
    }
}
