package com.iflytek.skillhub.dto;

/** Receipt for one published DSH plugin version. */
public record DshPluginPublishResponse(
        Long pluginId,
        String namespace,
        String slug,
        String packageName,
        String version,
        String status,
        boolean newPlugin
) {
}
