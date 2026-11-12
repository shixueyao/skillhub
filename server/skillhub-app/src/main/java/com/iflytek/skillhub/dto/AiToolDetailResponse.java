package com.iflytek.skillhub.dto;

import java.time.Instant;

/** Full AI tool page including usage instructions and checksum. */
public record AiToolDetailResponse(
        Long id,
        String name,
        String version,
        String summary,
        String usageInstructions,
        String category,
        String filename,
        String contentType,
        long sizeBytes,
        String sha256,
        long downloadCount,
        String createdBy,
        Instant createdAt,
        Instant updatedAt
) {
}
