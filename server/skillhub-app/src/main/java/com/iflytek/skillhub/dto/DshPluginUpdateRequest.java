package com.iflytek.skillhub.dto;

import jakarta.validation.constraints.Size;

import java.util.List;

/** Editable plugin metadata. Omitted fields keep their current value. */
public record DshPluginUpdateRequest(
        @Size(max = 256) String displayName,
        @Size(max = 2000) String summary,
        @Size(max = 20000) String description,
        @Size(max = 512) String homepage,
        @Size(max = 64) String license,
        @Size(max = 64) String category,
        @Size(max = 10) List<@Size(max = 32) String> tags
) {
}
