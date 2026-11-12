package com.iflytek.skillhub.dto;

import java.util.List;
import java.util.Map;

/** Create/update payload for remote URL, stdio command and pasted JSON forms. */
public record McpServerSaveRequest(
        String name,
        String summary,
        String description,
        String version,
        String category,
        String transport,
        String packageType,
        String packageName,
        String repositoryUrl,
        String docsUrl,
        List<String> tags,
        Map<String, Object> config
) {
}
