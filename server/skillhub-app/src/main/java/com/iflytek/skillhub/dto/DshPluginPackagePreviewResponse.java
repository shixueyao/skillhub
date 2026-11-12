package com.iflytek.skillhub.dto;

import java.util.List;
import java.util.Map;

/**
 * Result of reading an uploaded tarball before publication. Read-only: preview
 * never stores the upload or creates a plugin record.
 */
public record DshPluginPackagePreviewResponse(
        String packageName,
        String version,
        String description,
        String license,
        String homepage,
        Map<String, String> engines,
        Map<String, String> peerDependencies,
        List<String> capabilities,
        boolean newPlugin,
        String existingNamespace,
        String existingSlug,
        boolean versionExists
) {
}
