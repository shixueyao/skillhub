package com.iflytek.skillhub.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Full MCP server detail with the canonical client configuration. */
public record McpServerDetailResponse(
        Long id,
        String slug,
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
        String attachmentFilename,
        String attachmentContentType,
        Long attachmentSizeBytes,
        String attachmentSha256,
        Instant attachmentUploadedAt,
        List<String> tags,
        Map<String, Object> config,
        Map<String, Object> clientConfig,
        String authorId,
        String authorName,
        Instant createdAt,
        Instant updatedAt
) {
}
