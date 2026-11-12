package com.iflytek.skillhub.domain.dshplugin;

import java.util.List;
import java.util.Optional;

/** Persistence contract for immutable DSH plugin tarball versions. */
public interface DshPluginVersionRepository {

    Optional<DshPluginVersion> findById(Long id);

    Optional<DshPluginVersion> findLockedById(Long id);

    Optional<DshPluginVersion> findByPluginIdAndVersion(Long pluginId, String version);

    List<DshPluginVersion> findByPluginIdOrderByPublishedAtDesc(Long pluginId);

    List<DshPluginVersion> findByPluginIdAndStatusOrderByPublishedAtDesc(
            Long pluginId, DshPluginVersionStatus status);

    DshPluginVersion save(DshPluginVersion version);

    void flush();

    void delete(DshPluginVersion version);

    void incrementDownloadCount(Long versionId);
}
