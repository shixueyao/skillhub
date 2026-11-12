package com.iflytek.skillhub.domain.dshplugin;

import java.util.List;
import java.util.Map;

/**
 * Parsed identity and compatibility metadata read from an npm tarball's
 * {@code package/package.json}.
 *
 * @param manifestJson normalized JSON persisted for display; never contains scripts
 */
public record DshPluginPackage(
        String packageName,
        String version,
        String description,
        String license,
        String homepage,
        Map<String, String> engines,
        Map<String, String> peerDependencies,
        List<String> capabilities,
        String manifestJson
) {
}
