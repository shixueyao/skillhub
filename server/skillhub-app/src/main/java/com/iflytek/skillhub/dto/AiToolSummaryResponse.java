package com.iflytek.skillhub.dto;

import java.time.Instant;

/** Catalog card for one downloadable AI tool. */
public record AiToolSummaryResponse(
        Long id,
        String name,
        String version,
        String summary,
        String category,
        String filename,
        String contentType,
        long sizeBytes,
        long downloadCount,
        String createdBy,
        Instant createdAt,
        Instant updatedAt
) {
}
