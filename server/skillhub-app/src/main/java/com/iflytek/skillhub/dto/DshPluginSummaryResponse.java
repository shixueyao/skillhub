package com.iflytek.skillhub.dto;

import java.time.Instant;
import java.util.List;

/** Catalog card projection for one hosted DSH plugin. */
public record DshPluginSummaryResponse(
        Long id,
        String namespace,
        String namespaceDisplayName,
        String slug,
        String packageName,
        String displayName,
        String summary,
        String category,
        List<String> tags,
        String latestVersion,
        Instant latestPublishedAt,
        long versionCount,
        long downloadCount,
        boolean hidden,
        String createdBy,
        String createdByName,
        Instant createdAt,
        Instant updatedAt
) {
}
