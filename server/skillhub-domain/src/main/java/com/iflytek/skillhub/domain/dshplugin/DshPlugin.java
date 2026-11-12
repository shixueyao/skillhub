package com.iflytek.skillhub.domain.dshplugin;

import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/**
 * A hosted DSH plugin container. The npm package name is globally unique so a
 * generated install command always resolves to one publisher.
 */
@Entity
@Table(name = "dsh_plugin")
public class DshPlugin {

    private static final int MAX_DISPLAY_NAME = 256;
    private static final int MAX_SUMMARY = 2000;
    private static final int MAX_DESCRIPTION = 20_000;
    private static final int MAX_HOMEPAGE = 512;
    private static final int MAX_LICENSE = 64;
    private static final int MAX_CATEGORY = 64;
    private static final int MAX_TAGS = 10;
    private static final int MAX_TAG = 32;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "namespace_id", nullable = false)
    private Long namespaceId;

    @Column(nullable = false, length = 128)
    private String slug;

    @Column(name = "package_name", nullable = false, length = 214)
    private String packageName;

    @Column(name = "display_name", nullable = false, length = 256)
    private String displayName;

    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = 512)
    private String homepage;

    @Column(length = 64)
    private String license;

    @Column(length = 64)
    private String category;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String tags = "[]";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private DshPluginStatus status = DshPluginStatus.ACTIVE;

    @Column(name = "latest_version_id")
    private Long latestVersionId;

    @Column(name = "download_count", nullable = false)
    private long downloadCount;

    @Column(nullable = false)
    private boolean hidden;

    @Column(name = "hidden_at")
    private Instant hiddenAt;

    @Column(name = "hidden_by", length = 128)
    private String hiddenBy;

    @Column(name = "created_by", nullable = false, length = 128)
    private String createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_by", length = 128)
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected DshPlugin() {
    }

    public DshPlugin(Long namespaceId, String slug, String packageName, String displayName, String createdBy) {
        this.namespaceId = namespaceId;
        this.slug = slug;
        this.packageName = packageName;
        this.displayName = displayName;
        this.createdBy = createdBy;
        this.updatedBy = createdBy;
        this.status = DshPluginStatus.ACTIVE;
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

    /** Applies validated, user-editable metadata. Absent values keep their current field. */
    public void applyMetadata(String displayName,
                              String summary,
                              String description,
                              String homepage,
                              String license,
                              String category,
                              List<String> tags,
                              String updatedBy) {
        if (displayName != null) {
            this.displayName = requireText(displayName, MAX_DISPLAY_NAME, "error.dsh.plugin.displayName.invalid");
        }
        if (summary != null) {
            this.summary = requireNullableText(summary, MAX_SUMMARY, "error.dsh.plugin.summary.invalid");
        }
        if (description != null) {
            this.description = requireNullableText(description, MAX_DESCRIPTION, "error.dsh.plugin.description.invalid");
        }
        if (homepage != null) {
            this.homepage = requireNullableText(homepage, MAX_HOMEPAGE, "error.dsh.plugin.homepage.invalid");
        }
        if (license != null) {
            this.license = requireNullableText(license, MAX_LICENSE, "error.dsh.plugin.license.invalid");
        }
        if (category != null) {
            this.category = requireNullableText(category, MAX_CATEGORY, "error.dsh.plugin.category.invalid");
        }
        if (tags != null) {
            this.tags = DshPluginTags.toJson(normalizeTags(tags));
        }
        this.updatedBy = updatedBy;
    }

    public void setLatestVersionId(Long latestVersionId) {
        this.latestVersionId = latestVersionId;
    }

    public void hide(String actor, Instant at) {
        this.hidden = true;
        this.hiddenAt = at;
        this.hiddenBy = actor;
        this.updatedBy = actor;
    }

    public void restore(String actor) {
        this.hidden = false;
        this.hiddenAt = null;
        this.hiddenBy = null;
        this.updatedBy = actor;
    }

    public void archive(String actor) {
        this.status = DshPluginStatus.ARCHIVED;
        this.updatedBy = actor;
    }

    public void activate(String actor) {
        this.status = DshPluginStatus.ACTIVE;
        this.updatedBy = actor;
    }

    public List<String> tagList() {
        return DshPluginTags.fromJson(tags);
    }

    private static List<String> normalizeTags(List<String> raw) {
        List<String> tags = raw.stream()
                .filter(tag -> tag != null && !tag.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
        if (tags.size() > MAX_TAGS) {
            throw new DomainBadRequestException("error.dsh.plugin.tags.tooMany", MAX_TAGS);
        }
        for (String tag : tags) {
            if (tag.length() > MAX_TAG) {
                throw new DomainBadRequestException("error.dsh.plugin.tag.tooLong", MAX_TAG);
            }
        }
        return tags;
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

    public Long getNamespaceId() {
        return namespaceId;
    }

    public String getSlug() {
        return slug;
    }

    public String getPackageName() {
        return packageName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getSummary() {
        return summary;
    }

    public String getDescription() {
        return description;
    }

    public String getHomepage() {
        return homepage;
    }

    public String getLicense() {
        return license;
    }

    public String getCategory() {
        return category;
    }

    public String getTags() {
        return tags;
    }

    public DshPluginStatus getStatus() {
        return status;
    }

    public Long getLatestVersionId() {
        return latestVersionId;
    }

    public long getDownloadCount() {
        return downloadCount;
    }

    public boolean isHidden() {
        return hidden;
    }

    public Instant getHiddenAt() {
        return hiddenAt;
    }

    public String getHiddenBy() {
        return hiddenBy;
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
