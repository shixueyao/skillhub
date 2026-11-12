package com.iflytek.skillhub.dto;

import java.time.Instant;
import java.util.List;

/** Card/list representation of a user-published MCP server. */
public record McpServerSummaryResponse(
        Long id,
        String slug,
        String name,
        String summary,
        String version,
        String category,
        String transport,
        String packageType,
        String packageName,
        boolean hasAttachment,
        String attachmentFilename,
        List<String> tags,
        String authorId,
        String authorName,
        Instant createdAt,
        Instant updatedAt
) {
}
