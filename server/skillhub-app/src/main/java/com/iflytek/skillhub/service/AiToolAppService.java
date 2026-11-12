package com.iflytek.skillhub.service;

import com.iflytek.skillhub.domain.aitool.AiTool;
import com.iflytek.skillhub.domain.aitool.AiToolCategoryCount;
import com.iflytek.skillhub.domain.aitool.AiToolRepository;
import com.iflytek.skillhub.domain.audit.AuditDetail;
import com.iflytek.skillhub.domain.audit.AuditLogService;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.domain.shared.exception.DomainForbiddenException;
import com.iflytek.skillhub.domain.shared.exception.DomainNotFoundException;
import com.iflytek.skillhub.dto.AiToolCategoryResponse;
import com.iflytek.skillhub.dto.AiToolDetailResponse;
import com.iflytek.skillhub.dto.AiToolPublishResponse;
import com.iflytek.skillhub.dto.AiToolSummaryResponse;
import com.iflytek.skillhub.dto.AiToolUpdateRequest;
import com.iflytek.skillhub.dto.PageResponse;
import com.iflytek.skillhub.storage.ObjectStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Application service for admin-published downloadable AI tools. */
@Service
public class AiToolAppService {

    private static final Logger log = LoggerFactory.getLogger(AiToolAppService.class);
    private static final Set<String> ADMIN_ROLES = Set.of("SUPER_ADMIN");

    private final AiToolRepository toolRepository;
    private final ObjectStorageService objectStorageService;
    private final AuditLogService auditLogService;

    public AiToolAppService(AiToolRepository toolRepository,
                            ObjectStorageService objectStorageService,
                            AuditLogService auditLogService) {
        this.toolRepository = toolRepository;
        this.objectStorageService = objectStorageService;
        this.auditLogService = auditLogService;
    }

    public record PublishForm(
            String name,
            String version,
            String summary,
            String usageInstructions,
            String category
    ) {
    }

    public record DownloadResult(
            InputStream content,
            String filename,
            String contentType,
            long contentLength,
            String sha256
    ) {
    }

    public PageResponse<AiToolSummaryResponse> search(String query,
                                                       String category,
                                                       String sort,
                                                       int page,
                                                       int size) {
        int normalizedPage = Math.max(0, page);
        int normalizedSize = Math.min(Math.max(1, size), 100);
        List<AiToolSummaryResponse> items = toolRepository
                .search(query, category, sort, normalizedPage * normalizedSize, normalizedSize)
                .stream()
                .map(this::summary)
                .toList();
        return new PageResponse<>(
                items,
                toolRepository.count(query, category),
                normalizedPage,
                normalizedSize
        );
    }

    public List<AiToolCategoryResponse> categories() {
        return toolRepository.categories().stream()
                .map(this::category)
                .toList();
    }

    public AiToolDetailResponse detail(Long id) {
        return detailOf(requireTool(id));
    }

    @Transactional
    public AiToolPublishResponse publish(MultipartFile file,
                                         PublishForm form,
                                         String actor,
                                         Set<String> platformRoles,
                                         AuditRequestContext auditContext) {
        requireAdmin(platformRoles);
        if (file == null || file.isEmpty()) {
            throw new DomainBadRequestException("error.ai.tool.file.empty");
        }
        String filename = safeFilename(file.getOriginalFilename());
        String sha256 = sha256(file);
        String storageKey = "ai-tools/" + UUID.randomUUID() + "/" + filename;
        AiTool tool = new AiTool(
                form.name(),
                form.version(),
                form.summary(),
                form.usageInstructions(),
                form.category(),
                filename,
                storageKey,
                normalizeContentType(file.getContentType()),
                file.getSize(),
                sha256,
                actor
        );
        tool = toolRepository.save(tool);
        registerRollbackCleanup(storageKey);
        try (InputStream input = file.getInputStream()) {
            objectStorageService.putObject(
                    storageKey, input, file.getSize(),
                    tool.getContentType());
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read uploaded AI tool", exception);
        }
        audit(actor, "AI_TOOL_PUBLISH", tool.getId(), auditContext,
                AuditDetail.of("filename", filename));
        return new AiToolPublishResponse(tool.getId(), tool.getName(), tool.getFilename());
    }

    @Transactional
    public AiToolDetailResponse updateMetadata(Long id,
                                               AiToolUpdateRequest request,
                                               String actor,
                                               Set<String> platformRoles,
                                               AuditRequestContext auditContext) {
        requireAdmin(platformRoles);
        AiTool tool = requireTool(id);
        tool.applyMetadata(
                request.name(),
                request.version(),
                request.summary(),
                request.usageInstructions(),
                request.category(),
                actor
        );
        toolRepository.save(tool);
        audit(actor, "AI_TOOL_UPDATE", id, auditContext,
                AuditDetail.of("filename", tool.getFilename()));
        return detailOf(tool);
    }

    @Transactional
    public void delete(Long id,
                       String actor,
                       Set<String> platformRoles,
                       AuditRequestContext auditContext) {
        requireAdmin(platformRoles);
        AiTool tool = requireTool(id);
        try {
            objectStorageService.deleteObject(tool.getStorageKey());
        } catch (RuntimeException exception) {
            log.warn("Failed to delete AI tool object [key={}]", tool.getStorageKey(), exception);
        }
        toolRepository.delete(tool);
        audit(actor, "AI_TOOL_DELETE", id, auditContext,
                AuditDetail.of("filename", tool.getFilename()));
    }

    @Transactional
    public DownloadResult download(Long id) {
        AiTool tool = requireTool(id);
        if (!objectStorageService.exists(tool.getStorageKey())) {
            throw new DomainNotFoundException("error.ai.tool.file.missing", tool.getFilename());
        }
        toolRepository.incrementDownloadCount(tool.getId());
        return new DownloadResult(
                objectStorageService.getObject(tool.getStorageKey()),
                tool.getFilename(),
                tool.getContentType(),
                tool.getSizeBytes(),
                tool.getSha256()
        );
    }

    private AiTool requireTool(Long id) {
        return toolRepository.findById(id)
                .orElseThrow(() -> new DomainNotFoundException("error.ai.tool.notFound", id));
    }

    private AiToolSummaryResponse summary(AiTool tool) {
        return new AiToolSummaryResponse(
                tool.getId(), tool.getName(), tool.getVersion(), tool.getSummary(),
                tool.getCategory(), tool.getFilename(), tool.getContentType(),
                tool.getSizeBytes(), tool.getDownloadCount(), tool.getCreatedBy(),
                tool.getCreatedAt(), tool.getUpdatedAt()
        );
    }

    private AiToolDetailResponse detailOf(AiTool tool) {
        return new AiToolDetailResponse(
                tool.getId(), tool.getName(), tool.getVersion(), tool.getSummary(),
                tool.getUsageInstructions(), tool.getCategory(), tool.getFilename(),
                tool.getContentType(), tool.getSizeBytes(), tool.getSha256(),
                tool.getDownloadCount(), tool.getCreatedBy(),
                tool.getCreatedAt(), tool.getUpdatedAt()
        );
    }

    private AiToolCategoryResponse category(AiToolCategoryCount row) {
        return new AiToolCategoryResponse(row.category(), row.count());
    }

    private void requireAdmin(Set<String> platformRoles) {
        if (platformRoles == null || platformRoles.stream().noneMatch(ADMIN_ROLES::contains)) {
            throw new DomainForbiddenException("error.ai.tool.adminOnly");
        }
    }

    private void audit(String actor,
                       String action,
                       Long toolId,
                       AuditRequestContext context,
                       String detailJson) {
        auditLogService.record(
                actor,
                action,
                "AI_TOOL",
                toolId,
                null,
                context == null ? null : context.clientIp(),
                context == null ? null : context.userAgent(),
                detailJson
        );
    }

    private void registerRollbackCleanup(String storageKey) {
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
                    objectStorageService.deleteObject(storageKey);
                } catch (RuntimeException exception) {
                    log.warn("Failed to clean rolled-back AI tool object [key={}]", storageKey, exception);
                }
            }
        });
    }

    private static String normalizeContentType(String contentType) {
        if (contentType == null || contentType.isBlank() || contentType.length() > 128
                || !contentType.matches("[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+")) {
            return "application/octet-stream";
        }
        return contentType;
    }

    private static String safeFilename(String original) {
        String candidate = original == null ? "" : original;
        try {
            candidate = Path.of(candidate).getFileName().toString();
        } catch (RuntimeException ignored) {
            // Keep the raw name and sanitize below.
        }
        String sanitized = candidate
                .replaceAll("[\\\\/\\r\\n\\t\\\"]", "_")
                .trim();
        return sanitized.isEmpty() ? "tool" : sanitized;
    }

    private static String sha256(MultipartFile file) {
        try (InputStream input = file.getInputStream()) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to hash uploaded AI tool", exception);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
