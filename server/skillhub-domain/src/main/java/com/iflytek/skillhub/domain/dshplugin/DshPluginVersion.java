package com.iflytek.skillhub.domain.dshplugin;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Clock;
import java.time.Instant;

/**
 * One immutable published tarball. Version identity is the npm package version;
 * replacing a published coordinate is forbidden because installed DSH profiles
 * cache that exact coordinate.
 */
@Entity
@Table(name = "dsh_plugin_version")
public class DshPluginVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plugin_id", nullable = false)
    private Long pluginId;

    @Column(nullable = false, length = 64)
    private String version;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private DshPluginVersionStatus status;

    @Column(name = "tarball_key", nullable = false, length = 512)
    private String tarballKey;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String manifest = "{}";

    @Column(name = "compat_note", columnDefinition = "TEXT")
    private String compatNote;

    @Column(name = "release_notes", columnDefinition = "TEXT")
    private String releaseNotes;

    @Column(name = "download_count", nullable = false)
    private long downloadCount;

    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;

    @Column(name = "published_by", nullable = false, length = 128)
    private String publishedBy;

    @Column(name = "yanked_at")
    private Instant yankedAt;

    @Column(name = "yanked_by", length = 128)
    private String yankedBy;

    @Column(name = "yank_reason", columnDefinition = "TEXT")
    private String yankReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected DshPluginVersion() {
    }

    public DshPluginVersion(Long pluginId,
                            String version,
                            String tarballKey,
                            String sha256,
                            long sizeBytes,
                            String manifest,
                            String publishedBy) {
        this.pluginId = pluginId;
        this.version = version;
        this.tarballKey = tarballKey;
        this.sha256 = sha256;
        this.sizeBytes = sizeBytes;
        this.manifest = manifest == null || manifest.isBlank() ? "{}" : manifest;
        this.publishedBy = publishedBy;
        this.status = DshPluginVersionStatus.PUBLISHED;
        this.publishedAt = Instant.now(Clock.systemUTC());
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now(Clock.systemUTC());
        }
        if (publishedAt == null) {
            publishedAt = Instant.now(Clock.systemUTC());
        }
    }

    public void yank(String actor, String reason, Instant at) {
        this.status = DshPluginVersionStatus.YANKED;
        this.yankedAt = at;
        this.yankedBy = actor;
        this.yankReason = reason;
    }

    public void unyank() {
        this.status = DshPluginVersionStatus.PUBLISHED;
        this.yankedAt = null;
        this.yankedBy = null;
        this.yankReason = null;
    }

    public boolean isPublished() {
        return status == DshPluginVersionStatus.PUBLISHED;
    }

    public Long getId() {
        return id;
    }

    public Long getPluginId() {
        return pluginId;
    }

    public String getVersion() {
        return version;
    }

    public DshPluginVersionStatus getStatus() {
        return status;
    }

    public String getTarballKey() {
        return tarballKey;
    }

    public String getSha256() {
        return sha256;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getManifest() {
        return manifest;
    }

    public String getCompatNote() {
        return compatNote;
    }

    public void setCompatNote(String compatNote) {
        this.compatNote = compatNote;
    }

    public String getReleaseNotes() {
        return releaseNotes;
    }

    public void setReleaseNotes(String releaseNotes) {
        this.releaseNotes = releaseNotes;
    }

    public long getDownloadCount() {
        return downloadCount;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public String getPublishedBy() {
        return publishedBy;
    }

    public Instant getYankedAt() {
        return yankedAt;
    }

    public String getYankedBy() {
        return yankedBy;
    }

    public String getYankReason() {
        return yankReason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
