package com.iflytek.skillhub.domain.dshplugin;

import java.util.List;

/**
 * Optional, user-editable plugin metadata supplied with a publish or update.
 * A {@code null} field leaves the stored value unchanged.
 */
public record DshPluginMetadata(
        String displayName,
        String summary,
        String description,
        String homepage,
        String license,
        String category,
        List<String> tags
) {
    public static DshPluginMetadata empty() {
        return new DshPluginMetadata(null, null, null, null, null, null, null);
    }
}
