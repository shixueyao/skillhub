package com.iflytek.skillhub.domain.dshplugin;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

/** Persistence contract for hosted DSH plugin containers. */
public interface DshPluginRepository {

    Optional<DshPlugin> findById(Long id);

    Optional<DshPlugin> findLockedById(Long id);

    Optional<DshPlugin> findByNamespaceIdAndSlug(Long namespaceId, String slug);

    Optional<DshPlugin> findByPackageName(String packageName);

    List<DshPlugin> findByIdIn(List<Long> ids);

    List<DshPlugin> findByCreatedBy(String createdBy);

    Page<DshPlugin> findByCreatedBy(String createdBy, Pageable pageable);

    DshPlugin save(DshPlugin plugin);

    void flush();

    void delete(DshPlugin plugin);

    void incrementDownloadCount(Long pluginId);
}
