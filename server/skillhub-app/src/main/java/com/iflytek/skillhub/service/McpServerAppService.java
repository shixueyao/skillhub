package com.iflytek.skillhub.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.iflytek.skillhub.domain.audit.AuditDetail;
import com.iflytek.skillhub.domain.audit.AuditLogService;
import com.iflytek.skillhub.domain.mcp.McpCategoryCount;
import com.iflytek.skillhub.domain.mcp.McpServer;
import com.iflytek.skillhub.domain.mcp.McpServerRepository;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.domain.shared.exception.DomainForbiddenException;
import com.iflytek.skillhub.domain.shared.exception.DomainNotFoundException;
import com.iflytek.skillhub.dto.McpCategoryResponse;
import com.iflytek.skillhub.dto.McpServerDetailResponse;
import com.iflytek.skillhub.dto.McpServerPublishResponse;
import com.iflytek.skillhub.dto.McpServerSaveRequest;
import com.iflytek.skillhub.dto.McpServerSummaryResponse;
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
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Application service for the user-published MCP server registry. */
@Service
public class McpServerAppService {

    private static final Logger log = LoggerFactory.getLogger(McpServerAppService.class);
    private static final Set<String> PRIVILEGED_ROLES = Set.of("SUPER_ADMIN");
    private static final Set<String> PACKAGE_TYPES = Set.of("REMOTE", "NPM", "PYPI", "DOCKER", "CUSTOM");
    private static final int MAX_TAGS = 10;

    private final McpServerRepository repository;
    private final ObjectMapper objectMapper;
    private final ObjectStorageService objectStorageService;
    private final AuditLogService auditLogService;

    public McpServerAppService(McpServerRepository repository,
                               ObjectMapper objectMapper,
                               ObjectStorageService objectStorageService,
                               AuditLogService auditLogService) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.objectStorageService = objectStorageService;
        this.auditLogService = auditLogService;
    }

    public record AttachmentResult(
            InputStream content,
            String filename,
            String contentType,
            long contentLength,
            String sha256
    ) {
    }

    public PageResponse<McpServerSummaryResponse> search(String query,
                                                         String category,
                                                         String transport,
                                                         String sort,
                                                         int page,
                                                         int size) {
        int normalizedPage = Math.max(0, page);
        int normalizedSize = Math.min(Math.max(1, size), 100);
        List<McpServerSummaryResponse> items = repository
                .search(query, category, transport, sort, normalizedPage * normalizedSize, normalizedSize)
                .stream()
                .map(this::summary)
                .toList();
        return new PageResponse<>(items, repository.count(query, category, transport),
                normalizedPage, normalizedSize);
    }

    public PageResponse<McpServerSummaryResponse> searchMine(String authorId, int page, int size) {
        int normalizedPage = Math.max(0, page);
        int normalizedSize = Math.min(Math.max(1, size), 100);
        List<McpServerSummaryResponse> items = repository
                .searchByAuthor(authorId, normalizedPage * normalizedSize, normalizedSize)
                .stream()
                .map(this::summary)
                .toList();
        return new PageResponse<>(items, repository.countByAuthor(authorId),
                normalizedPage, normalizedSize);
    }

    public List<McpCategoryResponse> categories() {
        return repository.categories().stream()
                .map(this::category)
                .toList();
    }

    public McpServerDetailResponse detail(String slug) {
        return detailOf(requireBySlug(slug));
    }

    public AttachmentResult downloadAttachment(String slug) {
        McpServer server = requireBySlug(slug);
        String key = server.getAttachmentStorageKey();
        if (key == null || !objectStorageService.exists(key)) {
            throw new DomainNotFoundException("error.mcp.attachment.missing", slug);
        }
        return new AttachmentResult(
                objectStorageService.getObject(key),
                server.getAttachmentFilename(),
                server.getAttachmentContentType(),
                server.getAttachmentSizeBytes() == null ? 0 : server.getAttachmentSizeBytes(),
                server.getAttachmentSha256()
        );
    }

    @Transactional
    public McpServerPublishResponse publish(McpServerSaveRequest request,
                                             MultipartFile attachment,
                                             String actor,
                                             String authorName,
                                             AuditRequestContext auditContext) {
        Normalized normalized = normalize(request);
        String slug = uniqueSlug(slugify(request.name()));
        McpServer server = new McpServer(
                slug,
                request.name(),
                request.summary(),
                request.description(),
                request.version(),
                request.category(),
                normalized.transport(),
                normalized.endpointUrl(),
                normalized.command(),
                normalized.packageType(),
                normalized.packageName(),
                request.repositoryUrl(),
                request.docsUrl(),
                normalized.configJson(),
                normalized.tagsJson(),
                actor,
                authorName
        );
        server = repository.save(server);
        if (attachment != null && !attachment.isEmpty()) {
            attach(server, attachment);
            server = repository.save(server);
        }
        audit(actor, "MCP_SERVER_PUBLISH", server.getId(), auditContext,
                AuditDetail.of("slug", server.getSlug()));
        return new McpServerPublishResponse(server.getId(), server.getSlug(), server.getName());
    }

    @Transactional
    public McpServerDetailResponse update(Long id,
                                           McpServerSaveRequest request,
                                           MultipartFile attachment,
                                           String actor,
                                           Set<String> platformRoles,
                                           AuditRequestContext auditContext) {
        McpServer server = requireById(id);
        requireOwnerOrAdmin(server, actor, platformRoles);
        Normalized normalized = normalize(request);
        server.apply(
                request.name(),
                request.summary(),
                request.description(),
                request.version(),
                request.category(),
                normalized.transport(),
                normalized.endpointUrl(),
                normalized.command(),
                normalized.packageType(),
                normalized.packageName(),
                request.repositoryUrl(),
                request.docsUrl(),
                normalized.configJson(),
                normalized.tagsJson(),
                actor
        );
        String oldAttachmentKey = server.getAttachmentStorageKey();
        if (attachment != null && !attachment.isEmpty()) {
            attach(server, attachment);
        }
        server = repository.save(server);
        if (attachment != null && !attachment.isEmpty() && oldAttachmentKey != null
                && !oldAttachmentKey.equals(server.getAttachmentStorageKey())) {
            deleteAfterCommit(oldAttachmentKey);
        }
        audit(actor, "MCP_SERVER_UPDATE", id, auditContext,
                AuditDetail.of("slug", server.getSlug()));
        return detailOf(server);
    }

    @Transactional
    public void delete(Long id,
                       String actor,
                       Set<String> platformRoles,
                       AuditRequestContext auditContext) {
        McpServer server = requireById(id);
        requireOwnerOrAdmin(server, actor, platformRoles);
        String attachmentKey = server.getAttachmentStorageKey();
        repository.delete(server);
        if (attachmentKey != null) {
            deleteAfterCommit(attachmentKey);
        }
        audit(actor, "MCP_SERVER_DELETE", id, auditContext,
                AuditDetail.of("slug", server.getSlug()));
    }

    private void attach(McpServer server, MultipartFile file) {
        String filename = safeFilename(file.getOriginalFilename());
        String storageKey = "mcp-servers/" + UUID.randomUUID() + "/" + filename;
        String contentType = normalizeContentType(file.getContentType());
        String sha256 = sha256(file);
        server.attachFile(filename, storageKey, contentType, file.getSize(), sha256);
        registerRollbackCleanup(storageKey);
        try (InputStream input = file.getInputStream()) {
            objectStorageService.putObject(storageKey, input, file.getSize(), contentType);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read uploaded MCP attachment", exception);
        }
    }

    private void deleteAfterCommit(String storageKey) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            deleteQuietly(storageKey);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteQuietly(storageKey);
            }
        });
    }

    private void registerRollbackCleanup(String storageKey) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    deleteQuietly(storageKey);
                }
            }
        });
    }

    private void deleteQuietly(String storageKey) {
        try {
            objectStorageService.deleteObject(storageKey);
        } catch (RuntimeException exception) {
            log.warn("Failed to delete MCP attachment [key={}]", storageKey, exception);
        }
    }

    private static String safeFilename(String original) {
        String candidate = original == null ? "" : original;
        try {
            candidate = Path.of(candidate).getFileName().toString();
        } catch (RuntimeException ignored) {
            // Keep the raw name and sanitize below.
        }
        String sanitized = candidate.replaceAll("[\\\\/\\r\\n\\t\\\"]", "_").trim();
        return sanitized.isEmpty() ? "mcp-attachment" : sanitized;
    }

    private static String normalizeContentType(String contentType) {
        if (contentType == null || contentType.isBlank() || contentType.length() > 128
                || !contentType.matches("[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+")) {
            return "application/octet-stream";
        }
        return contentType;
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
            throw new IllegalStateException("Failed to hash uploaded MCP attachment", exception);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private McpServer requireBySlug(String slug) {
        return repository.findBySlug(slug)
                .orElseThrow(() -> new DomainNotFoundException("error.mcp.notFound", slug));
    }

    private McpServer requireById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new DomainNotFoundException("error.mcp.notFound", id));
    }

    private void requireOwnerOrAdmin(McpServer server, String actor, Set<String> roles) {
        boolean admin = roles != null && roles.stream().anyMatch(PRIVILEGED_ROLES::contains);
        if (!admin && !server.getAuthorId().equals(actor)) {
            throw new DomainForbiddenException("error.mcp.ownerOnly");
        }
    }

    private Normalized normalize(McpServerSaveRequest request) {
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new DomainBadRequestException("error.mcp.name.required");
        }
        Map<String, Object> config = unwrapConfig(request.config());
        String command = stringValue(config.get("command"));
        String url = stringValue(config.get("url"));
        if (url.isBlank() && command.isBlank()) {
            throw new DomainBadRequestException("error.mcp.config.missingEndpoint");
        }

        String transport;
        String packageType = normalizePackageType(request.packageType());
        String endpointUrl = null;
        if (!command.isBlank()) {
            transport = "STDIO";
            packageType = packageType == null || "REMOTE".equals(packageType)
                    ? inferPackageType(command, config.get("args"))
                    : packageType;
            config.put("command", command);
            config.putIfAbsent("args", List.of());
            config.putIfAbsent("env", Map.of());
        } else {
            validateUrl(url);
            endpointUrl = url;
            String configType = stringValue(config.get("type")).toLowerCase(Locale.ROOT);
            transport = "sse".equals(configType) || "sse".equalsIgnoreCase(request.transport())
                    ? "SSE"
                    : "STREAMABLE_HTTP";
            packageType = packageType == null ? "REMOTE" : packageType;
            config.put("type", transport.equals("SSE") ? "sse" : "streamable-http");
            config.put("url", url);
        }

        String packageName = trimToNull(request.packageName());
        if (packageName == null && !"REMOTE".equals(packageType)) {
            packageName = inferPackageName(command, config.get("args"));
        }
        String configJson = writeJson(config);
        String tagsJson = writeJson(normalizeTags(request.tags()));
        return new Normalized(transport, endpointUrl, command.isBlank() ? null : command,
                packageType, packageName, configJson, tagsJson);
    }

    private Map<String, Object> unwrapConfig(Map<String, Object> raw) {
        if (raw == null || raw.isEmpty()) {
            throw new DomainBadRequestException("error.mcp.config.required");
        }
        Object wrapped = raw.get("mcpServers");
        if (wrapped instanceof Map<?, ?> servers && !servers.isEmpty()) {
            Object first = servers.values().iterator().next();
            if (first instanceof Map<?, ?> entry) {
                return toStringMap(entry);
            }
        }
        return new LinkedHashMap<>(raw);
    }

    private Map<String, Object> toStringMap(Map<?, ?> source) {
        Map<String, Object> result = new LinkedHashMap<>();
        source.forEach((key, value) -> {
            if (key instanceof String text && value != null) {
                result.put(text, value);
            }
        });
        return result;
    }

    private List<String> normalizeTags(List<String> tags) {
        if (tags == null) return List.of();
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String tag : tags) {
            if (tag == null) continue;
            String trimmed = tag.trim();
            if (trimmed.isEmpty() || trimmed.length() > 40) continue;
            unique.add(trimmed);
            if (unique.size() >= MAX_TAGS) break;
        }
        return new ArrayList<>(unique);
    }

    private String normalizePackageType(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!PACKAGE_TYPES.contains(normalized)) {
            throw new DomainBadRequestException("error.mcp.package.invalid");
        }
        return normalized;
    }

    private String inferPackageType(String command, Object rawArgs) {
        String executable = command.toLowerCase(Locale.ROOT);
        if (executable.contains("docker")) return "DOCKER";
        if (executable.endsWith("npx") || executable.endsWith("npm")) return "NPM";
        if (executable.endsWith("uvx") || executable.endsWith("pipx") || executable.endsWith("python")) return "PYPI";
        if (rawArgs != null) return "CUSTOM";
        return "CUSTOM";
    }

    private String inferPackageName(String command, Object rawArgs) {
        if (rawArgs instanceof List<?> args) {
            for (Object arg : args) {
                if (!(arg instanceof String value)) continue;
                String trimmed = value.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("-")) continue;
                if ("run".equals(trimmed) || "exec".equals(trimmed)) continue;
                return trimmed;
            }
        }
        return trimToNull(command);
    }

    private void validateUrl(String value) {
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))
                    || uri.getHost() == null) {
                throw new DomainBadRequestException("error.mcp.endpoint.invalid");
            }
        } catch (URISyntaxException exception) {
            throw new DomainBadRequestException("error.mcp.endpoint.invalid");
        }
    }

    private String uniqueSlug(String base) {
        String candidate = base;
        int suffix = 2;
        while (repository.slugExists(candidate)) {
            candidate = base + "-" + suffix++;
        }
        return candidate;
    }

    private String slugify(String value) {
        String slug = value == null ? "" : value.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (slug.length() > 80) slug = slug.substring(0, 80);
        return slug.isBlank() ? "mcp-server" : slug;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new DomainBadRequestException("error.mcp.config.invalid");
        }
    }

    private Map<String, Object> readConfig(McpServer server) {
        try {
            return objectMapper.readValue(server.getConfigJson(), new TypeReference<>() {});
        } catch (JsonProcessingException exception) {
            return Map.of();
        }
    }

    private List<String> readTags(McpServer server) {
        try {
            return objectMapper.readValue(server.getTagsJson(), new TypeReference<>() {});
        } catch (JsonProcessingException exception) {
            return List.of();
        }
    }

    private String stringValue(Object value) {
        return value instanceof String text ? text.trim() : "";
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }

    private McpServerSummaryResponse summary(McpServer server) {
        return new McpServerSummaryResponse(
                server.getId(), server.getSlug(), server.getName(), server.getSummary(),
                server.getVersion(), server.getCategory(), server.getTransport(),
                server.getPackageType(), server.getPackageName(),
                server.getAttachmentStorageKey() != null, server.getAttachmentFilename(),
                readTags(server), server.getAuthorId(), server.getAuthorName(),
                server.getCreatedAt(), server.getUpdatedAt()
        );
    }

    private McpServerDetailResponse detailOf(McpServer server) {
        Map<String, Object> config = readConfig(server);
        Map<String, Object> clientConfig = Map.of(
                "mcpServers", Map.of(server.getSlug(), config)
        );
        return new McpServerDetailResponse(
                server.getId(), server.getSlug(), server.getName(), server.getSummary(),
                server.getDescription(), server.getVersion(), server.getCategory(),
                server.getTransport(), server.getEndpointUrl(), server.getCommand(),
                server.getPackageType(), server.getPackageName(),
                server.getRepositoryUrl(), server.getDocsUrl(),
                server.getAttachmentFilename(), server.getAttachmentContentType(),
                server.getAttachmentSizeBytes(), server.getAttachmentSha256(),
                server.getAttachmentUploadedAt(), readTags(server),
                config, clientConfig, server.getAuthorId(), server.getAuthorName(),
                server.getCreatedAt(), server.getUpdatedAt()
        );
    }

    private McpCategoryResponse category(McpCategoryCount row) {
        return new McpCategoryResponse(row.category(), row.count());
    }

    private void audit(String actor, String action, Long id,
                       AuditRequestContext context, String detailJson) {
        auditLogService.record(actor, action, "MCP_SERVER", id, null,
                context == null ? null : context.clientIp(),
                context == null ? null : context.userAgent(), detailJson);
    }

    private record Normalized(String transport,
                              String endpointUrl,
                              String command,
                              String packageType,
                              String packageName,
                              String configJson,
                              String tagsJson) {
    }
}
