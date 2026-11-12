package com.iflytek.skillhub.infra.jpa;

import com.iflytek.skillhub.domain.dshplugin.DshPlugin;
import com.iflytek.skillhub.domain.dshplugin.DshPluginRepository;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** JPA-backed DSH plugin repository fulfilling the domain contract. */
@Repository
public interface DshPluginJpaRepository extends JpaRepository<DshPlugin, Long>, DshPluginRepository {

    @Override
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from DshPlugin p where p.id = :id")
    Optional<DshPlugin> findLockedById(@Param("id") Long id);

    Optional<DshPlugin> findByNamespaceIdAndSlug(Long namespaceId, String slug);

    Optional<DshPlugin> findByPackageName(String packageName);

    List<DshPlugin> findByIdIn(List<Long> ids);

    List<DshPlugin> findByCreatedBy(String createdBy);

    Page<DshPlugin> findByCreatedBy(String createdBy, Pageable pageable);

    @Modifying
    @Transactional
    @Query("update DshPlugin p set p.downloadCount = p.downloadCount + 1 where p.id = :pluginId")
    void incrementDownloadCount(@Param("pluginId") Long pluginId);
}
