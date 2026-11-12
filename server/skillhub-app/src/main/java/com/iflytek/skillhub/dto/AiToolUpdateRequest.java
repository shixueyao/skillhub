package com.iflytek.skillhub.dto;

/** Editable metadata for an existing AI tool. */
public record AiToolUpdateRequest(
        String name,
        String version,
        String summary,
        String usageInstructions,
        String category
) {
}
