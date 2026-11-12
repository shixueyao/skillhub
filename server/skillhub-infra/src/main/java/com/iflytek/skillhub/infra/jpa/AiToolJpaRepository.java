package com.iflytek.skillhub.infra.jpa;

import com.iflytek.skillhub.domain.aitool.AiTool;
import com.iflytek.skillhub.domain.aitool.AiToolCategoryCount;
import com.iflytek.skillhub.domain.aitool.AiToolRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** JPA-backed repository for AI tool downloads. */
@Repository
public interface AiToolJpaRepository extends JpaRepository<AiTool, Long>, AiToolRepository {

    @Query("""
            select t from AiTool t
            where (:query = '' or lower(t.name) like lower(concat('%', :query, '%'))
                or lower(coalesce(t.summary, '')) like lower(concat('%', :query, '%'))
                or lower(coalesce(t.category, '')) like lower(concat('%', :query, '%')))
              and (:category = '' or t.category = :category)
            """)
    Page<AiTool> findPage(@Param("query") String query,
                          @Param("category") String category,
                          Pageable pageable);

    @Query("""
            select count(t) from AiTool t
            where (:query = '' or lower(t.name) like lower(concat('%', :query, '%'))
                or lower(coalesce(t.summary, '')) like lower(concat('%', :query, '%'))
                or lower(coalesce(t.category, '')) like lower(concat('%', :query, '%')))
              and (:category = '' or t.category = :category)
            """)
    long countMatching(@Param("query") String query, @Param("category") String category);

    @Query("""
            select t.category, count(t)
            from AiTool t
            where t.category is not null and t.category <> ''
            group by t.category
            order by count(t) desc, t.category asc
            """)
    List<Object[]> categoryCounts();

    @Override
    default List<AiTool> search(String query, String category, String sort, int offset, int limit) {
        int page = limit <= 0 ? 0 : Math.max(0, offset) / limit;
        Pageable pageable = PageRequest.of(page, Math.max(1, limit), sortFor(sort));
        return findPage(normalize(query), normalize(category), pageable).getContent();
    }

    @Override
    default long count(String query, String category) {
        return countMatching(normalize(query), normalize(category));
    }

    @Override
    default List<AiToolCategoryCount> categories() {
        return categoryCounts().stream()
                .map(row -> new AiToolCategoryCount((String) row[0], ((Number) row[1]).longValue()))
                .toList();
    }

    @Modifying
    @Transactional
    @Query("update AiTool t set t.downloadCount = t.downloadCount + 1 where t.id = :id")
    void incrementDownloadCount(@Param("id") Long id);

    private static Sort sortFor(String sort) {
        if ("downloads".equalsIgnoreCase(sort)) {
            return Sort.by(Sort.Direction.DESC, "downloadCount").and(Sort.by(Sort.Direction.DESC, "createdAt"));
        }
        if ("name".equalsIgnoreCase(sort)) {
            return Sort.by(Sort.Direction.ASC, "name");
        }
        return Sort.by(Sort.Direction.DESC, "createdAt");
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
