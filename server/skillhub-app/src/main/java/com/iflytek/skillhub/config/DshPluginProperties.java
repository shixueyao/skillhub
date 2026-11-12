package com.iflytek.skillhub.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Upload bounds for hosted DSH plugin tarballs. The defaults match the previous
 * nginx limit (50 MB) so moving publication behind the API does not silently
 * accept larger packages than operators already allow.
 */
@Component
@ConfigurationProperties(prefix = "skillhub.dsh-plugin")
public class DshPluginProperties {

    private long maxPackageSize = 50L * 1024 * 1024;
    private long maxUncompressedSize = 256L * 1024 * 1024;
    private long maxManifestSize = 2L * 1024 * 1024;
    private int maxEntries = 10_000;

    public long getMaxPackageSize() {
        return maxPackageSize;
    }

    public void setMaxPackageSize(long maxPackageSize) {
        this.maxPackageSize = maxPackageSize;
    }

    public long getMaxUncompressedSize() {
        return maxUncompressedSize;
    }

    public void setMaxUncompressedSize(long maxUncompressedSize) {
        this.maxUncompressedSize = maxUncompressedSize;
    }

    public long getMaxManifestSize() {
        return maxManifestSize;
    }

    public void setMaxManifestSize(long maxManifestSize) {
        this.maxManifestSize = maxManifestSize;
    }

    public int getMaxEntries() {
        return maxEntries;
    }

    public void setMaxEntries(int maxEntries) {
        this.maxEntries = maxEntries;
    }
}
