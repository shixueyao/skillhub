package com.iflytek.skillhub.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** One published tarball, including the compatibility metadata parsed at publish time. */
public record DshPluginVersionResponse(
        Long id,
        String version,
        String status,
        String sha256,
        long sizeBytes,
        List<String> capabilities,
        Map<String, String> engines,
        Map<String, String> peerDependencies,
        String compatNote,
        String releaseNotes,
        long downloadCount,
        Instant publishedAt,
        String publishedBy,
        Instant yankedAt,
        String yankedBy,
        String yankReason,
        boolean recommended
) {
}
