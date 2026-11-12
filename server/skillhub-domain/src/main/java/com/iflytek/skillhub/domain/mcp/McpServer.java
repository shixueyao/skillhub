package com.iflytek.skillhub.domain.mcp;

import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Clock;
import java.time.Instant;

/**
 * A user-published MCP server definition. The canonical client configuration is
 * stored as JSON so remote, stdio and pasted-config forms share one registry.
 */
@Entity
@Table(name = "mcp_server")
public class McpServer {

    private static final int MAX_SLUG = 96;
    private static final int MAX_NAME = 256;
    private static final int MAX_SUMMARY = 2000;
    private static final int MAX_DESCRIPTION = 50_000;
    private static final int MAX_VERSION = 64;
    private static final int MAX_CATEGORY = 64;
    private static final int MAX_URL = 2048;
    private static final int MAX_COMMAND = 512;
    private static final int MAX_PACKAGE = 512;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = MAX_SLUG)
    private String slug;

    @Column(nullable = false, length = MAX_NAME)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = MAX_VERSION)
    private String version;

    @Column(length = MAX_CATEGORY)
    private String category;

    @Column(nullable = false, length = 32)
    private String transport;

    @Column(name = "endpoint_url", length = MAX_URL)
    private String endpointUrl;

    @Column(length = MAX_COMMAND)
    private String command;

    @Column(name = "package_type", nullable = false, length = 32)
    private String packageType;

    @Column(name = "package_name", length = MAX_PACKAGE)
    private String packageName;

    @Column(name = "repository_url", length = MAX_URL)
    private String repositoryUrl;

    @Column(name = "docs_url", length = MAX_URL)
    private String docsUrl;

    @Column(name = "config_json", nullable = false, columnDefinition = "TEXT")
    private String configJson;

    @Column(name = "tags_json", nullable = false, columnDefinition = "TEXT")
    private String tagsJson;

    @Column(name = "author_id", nullable = false, length = 128)
    private String authorId;

    @Column(name = "author_name", length = 256)
    private String authorName;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "attachment_filename", length = 512)
    private String attachmentFilename;

    @Column(name = "attachment_storage_key", length = 512)
    private String attachmentStorageKey;

    @Column(name = "attachment_content_type", length = 128)
    private String attachmentContentType;

    @Column(name = "attachment_size_bytes")
    private Long attachmentSizeBytes;

    @Column(name = "attachment_sha256", length = 64)
    private String attachmentSha256;

    @Column(name = "attachment_uploaded_at")
    private Instant attachmentUploadedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected McpServer() {
    }

    public McpServer(String slug,
                     String name,
                     String summary,
                     String description,
                     String version,
                     String category,
                     String transport,
                     String endpointUrl,
                     String command,
                     String packageType,
                     String packageName,
                     String repositoryUrl,
                     String docsUrl,
                     String configJson,
                     String tagsJson,
                     String authorId,
                     String authorName) {
        this.slug = requireText(slug, MAX_SLUG, "error.mcp.slug.invalid");
        this.authorId = requireText(authorId, 128, "error.mcp.author.invalid");
        this.authorName = requireNullableText(authorName, MAX_NAME, "error.mcp.author.invalid");
        this.status = "ACTIVE";
        apply(name, summary, description, version, category, transport, endpointUrl,
                command, packageType, packageName, repositoryUrl, docsUrl,
                configJson, tagsJson, authorId);
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now(Clock.systemUTC());
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now(Clock.systemUTC());
    }

    public void apply(String name,
                      String summary,
                      String description,
                      String version,
                      String category,
                      String transport,
                      String endpointUrl,
                      String command,
                      String packageType,
                      String packageName,
                      String repositoryUrl,
                      String docsUrl,
                      String configJson,
                      String tagsJson,
                      String updatedBy) {
        this.name = requireText(name, MAX_NAME, "error.mcp.name.invalid");
        this.summary = requireNullableText(summary, MAX_SUMMARY, "error.mcp.summary.invalid");
        this.description = requireNullableText(description, MAX_DESCRIPTION, "error.mcp.description.invalid");
        this.version = requireNullableText(version, MAX_VERSION, "error.mcp.version.invalid");
        this.category = requireNullableText(category, MAX_CATEGORY, "error.mcp.category.invalid");
        this.transport = requireText(transport, 32, "error.mcp.transport.invalid");
        this.endpointUrl = requireNullableUrl(endpointUrl, "error.mcp.endpoint.invalid");
        this.command = requireNullableText(command, MAX_COMMAND, "error.mcp.command.invalid");
        this.packageType = requireText(packageType, 32, "error.mcp.package.invalid");
        this.packageName = requireNullableText(packageName, MAX_PACKAGE, "error.mcp.package.invalid");
        this.repositoryUrl = requireNullableUrl(repositoryUrl, "error.mcp.repository.invalid");
        this.docsUrl = requireNullableUrl(docsUrl, "error.mcp.docs.invalid");
        this.configJson = requireText(configJson, 100_000, "error.mcp.config.invalid");
        this.tagsJson = tagsJson == null || tagsJson.isBlank() ? "[]" : tagsJson;
    }

    private static String requireText(String value, int max, String code) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty() || trimmed.length() > max) {
            throw new DomainBadRequestException(code, max);
        }
        return trimmed;
    }

    private static String requireNullableText(String value, int max, String code) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.length() > max) {
            throw new DomainBadRequestException(code, max);
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String requireNullableUrl(String value, String code) {
        String trimmed = requireNullableText(value, MAX_URL, code);
        if (trimmed == null) return null;
        String lower = trimmed.toLowerCase();
        if (!lower.startsWith("https://") && !lower.startsWith("http://")) {
            throw new DomainBadRequestException(code);
        }
        return trimmed;
    }

    public void attachFile(String filename,
                           String storageKey,
                           String contentType,
                           long sizeBytes,
                           String sha256) {
        this.attachmentFilename = requireText(filename, 512, "error.mcp.attachment.invalid");
        this.attachmentStorageKey = requireText(storageKey, 512, "error.mcp.attachment.invalid");
        this.attachmentContentType = contentType == null || contentType.isBlank()
                ? "application/octet-stream"
                : contentType;
        this.attachmentSizeBytes = sizeBytes;
        this.attachmentSha256 = requireText(sha256, 64, "error.mcp.attachment.invalid");
        this.attachmentUploadedAt = Instant.now(Clock.systemUTC());
    }

    public void clearAttachment() {
        this.attachmentFilename = null;
        this.attachmentStorageKey = null;
        this.attachmentContentType = null;
        this.attachmentSizeBytes = null;
        this.attachmentSha256 = null;
        this.attachmentUploadedAt = null;
    }

    public Long getId() { return id; }
    public String getSlug() { return slug; }
    public String getName() { return name; }
    public String getSummary() { return summary; }
    public String getDescription() { return description; }
    public String getVersion() { return version; }
    public String getCategory() { return category; }
    public String getTransport() { return transport; }
    public String getEndpointUrl() { return endpointUrl; }
    public String getCommand() { return command; }
    public String getPackageType() { return packageType; }
    public String getPackageName() { return packageName; }
    public String getRepositoryUrl() { return repositoryUrl; }
    public String getDocsUrl() { return docsUrl; }
    public String getConfigJson() { return configJson; }
    public String getTagsJson() { return tagsJson; }
    public String getAuthorId() { return authorId; }
    public String getAuthorName() { return authorName; }
    public String getStatus() { return status; }
    public String getAttachmentFilename() { return attachmentFilename; }
    public String getAttachmentStorageKey() { return attachmentStorageKey; }
    public String getAttachmentContentType() { return attachmentContentType; }
    public Long getAttachmentSizeBytes() { return attachmentSizeBytes; }
    public String getAttachmentSha256() { return attachmentSha256; }
    public Instant getAttachmentUploadedAt() { return attachmentUploadedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
