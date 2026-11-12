package com.iflytek.skillhub.domain.aitool;

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
 * An admin-published downloadable AI tool. One row owns one immutable uploaded
 * file; metadata can be edited without replacing the artifact.
 */
@Entity
@Table(name = "ai_tool")
public class AiTool {

    private static final int MAX_NAME = 256;
    private static final int MAX_FILENAME = 512;
    private static final int MAX_VERSION = 64;
    private static final int MAX_SUMMARY = 2000;
    private static final int MAX_USAGE = 20_000;
    private static final int MAX_CATEGORY = 64;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 256)
    private String name;

    @Column(length = 64)
    private String version;

    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(name = "usage_instructions", columnDefinition = "TEXT")
    private String usageInstructions;

    @Column(length = 64)
    private String category;

    @Column(nullable = false, length = 512)
    private String filename;

    @Column(name = "storage_key", nullable = false, length = 512)
    private String storageKey;

    @Column(name = "content_type", nullable = false, length = 128)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(name = "download_count", nullable = false)
    private long downloadCount;

    @Column(name = "created_by", nullable = false, length = 128)
    private String createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_by", length = 128)
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected AiTool() {
    }

    public AiTool(String name,
                  String version,
                  String summary,
                  String usageInstructions,
                  String category,
                  String filename,
                  String storageKey,
                  String contentType,
                  long sizeBytes,
                  String sha256,
                  String createdBy) {
        this.filename = requireText(filename, MAX_FILENAME, "error.ai.tool.filename.invalid");
        this.storageKey = storageKey;
        this.contentType = contentType == null || contentType.isBlank()
                ? "application/octet-stream"
                : contentType;
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256;
        this.createdBy = createdBy;
        this.updatedBy = createdBy;
        applyMetadata(name, version, summary, usageInstructions, category, createdBy);
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

    public void applyMetadata(String name,
                              String version,
                              String summary,
                              String usageInstructions,
                              String category,
                              String updatedBy) {
        this.name = requireText(name, MAX_NAME, "error.ai.tool.name.invalid");
        this.version = requireNullableText(version, MAX_VERSION, "error.ai.tool.version.invalid");
        this.summary = requireNullableText(summary, MAX_SUMMARY, "error.ai.tool.summary.invalid");
        this.usageInstructions = requireNullableText(
                usageInstructions, MAX_USAGE, "error.ai.tool.usage.invalid");
        this.category = requireNullableText(category, MAX_CATEGORY, "error.ai.tool.category.invalid");
        this.updatedBy = updatedBy;
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

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getVersion() {
        return version;
    }

    public String getSummary() {
        return summary;
    }

    public String getUsageInstructions() {
        return usageInstructions;
    }

    public String getCategory() {
        return category;
    }

    public String getFilename() {
        return filename;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getSha256() {
        return sha256;
    }

    public long getDownloadCount() {
        return downloadCount;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
