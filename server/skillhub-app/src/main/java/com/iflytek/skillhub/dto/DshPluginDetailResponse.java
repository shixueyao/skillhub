package com.iflytek.skillhub.dto;

import com.iflytek.skillhub.domain.dshplugin.DshPluginAction;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/** Full plugin page: metadata, version ledger, and the caller's permitted actions. */
public record DshPluginDetailResponse(
        Long id,
        Long namespaceId,
        String namespace,
        String namespaceDisplayName,
        String slug,
        String packageName,
        String displayName,
        String summary,
        String description,
        String homepage,
        String license,
        String category,
        List<String> tags,
        String status,
        boolean hidden,
        Long latestVersionId,
        String latestVersion,
        long downloadCount,
        String createdBy,
        String createdByName,
        Instant createdAt,
        Instant updatedAt,
        Set<DshPluginAction> allowedActions,
        List<DshPluginVersionResponse> versions
) {
}
