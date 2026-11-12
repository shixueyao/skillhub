package com.iflytek.skillhub.infra.jpa;

import com.iflytek.skillhub.domain.dshplugin.DshPluginVersion;
import com.iflytek.skillhub.domain.dshplugin.DshPluginVersionRepository;
import com.iflytek.skillhub.domain.dshplugin.DshPluginVersionStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** JPA-backed DSH plugin version repository fulfilling the domain contract. */
@Repository
public interface DshPluginVersionJpaRepository
        extends JpaRepository<DshPluginVersion, Long>, DshPluginVersionRepository {

    @Override
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from DshPluginVersion v where v.id = :id")
    Optional<DshPluginVersion> findLockedById(@Param("id") Long id);

    Optional<DshPluginVersion> findByPluginIdAndVersion(Long pluginId, String version);

    List<DshPluginVersion> findByPluginIdOrderByPublishedAtDesc(Long pluginId);

    List<DshPluginVersion> findByPluginIdAndStatusOrderByPublishedAtDesc(
            Long pluginId, DshPluginVersionStatus status);

    @Modifying
    @Transactional
    @Query("update DshPluginVersion v set v.downloadCount = v.downloadCount + 1 where v.id = :versionId")
    void incrementDownloadCount(@Param("versionId") Long versionId);
}
