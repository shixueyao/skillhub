package com.iflytek.skillhub.infra.jpa;

import com.iflytek.skillhub.domain.mcp.McpCategoryCount;
import com.iflytek.skillhub.domain.mcp.McpServer;
import com.iflytek.skillhub.domain.mcp.McpServerRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** JPA-backed repository for the MCP server registry. */
@Repository
public interface McpServerJpaRepository extends JpaRepository<McpServer, Long>, McpServerRepository {

    @Query("""
            select s from McpServer s
            where s.status = 'ACTIVE'
              and (:query = '' or lower(s.name) like lower(concat('%', :query, '%'))
                or lower(coalesce(s.summary, '')) like lower(concat('%', :query, '%'))
                or lower(coalesce(s.description, '')) like lower(concat('%', :query, '%'))
                or lower(coalesce(s.category, '')) like lower(concat('%', :query, '%')))
              and (:category = '' or s.category = :category)
              and (:transport = '' or s.transport = :transport)
            """)
    Page<McpServer> findPage(@Param("query") String query,
                             @Param("category") String category,
                             @Param("transport") String transport,
                             Pageable pageable);

    @Query("""
            select count(s) from McpServer s
            where s.status = 'ACTIVE'
              and (:query = '' or lower(s.name) like lower(concat('%', :query, '%'))
                or lower(coalesce(s.summary, '')) like lower(concat('%', :query, '%'))
                or lower(coalesce(s.description, '')) like lower(concat('%', :query, '%'))
                or lower(coalesce(s.category, '')) like lower(concat('%', :query, '%')))
              and (:category = '' or s.category = :category)
              and (:transport = '' or s.transport = :transport)
            """)
    long countMatching(@Param("query") String query,
                       @Param("category") String category,
                       @Param("transport") String transport);

    @Query("""
            select s.category, count(s)
            from McpServer s
            where s.status = 'ACTIVE' and s.category is not null and s.category <> ''
            group by s.category
            order by count(s) desc, s.category asc
            """)
    List<Object[]> categoryCounts();

    @Query("""
            select s from McpServer s
            where s.authorId = :authorId and s.status = 'ACTIVE'
            order by s.updatedAt desc
            """)
    Page<McpServer> findByAuthor(@Param("authorId") String authorId, Pageable pageable);

    @Query("""
            select count(s) from McpServer s
            where s.authorId = :authorId and s.status = 'ACTIVE'
            """)
    long countByAuthorId(@Param("authorId") String authorId);

    @Override
    default Optional<McpServer> findBySlug(String slug) {
        return findOneBySlugAndStatus(slug, "ACTIVE");
    }

    Optional<McpServer> findOneBySlugAndStatus(String slug, String status);

    @Override
    default boolean slugExists(String slug) {
        return existsBySlug(slug);
    }

    boolean existsBySlug(String slug);

    @Override
    default List<McpServer> search(String query, String category, String transport,
                                   String sort, int offset, int limit) {
        int page = limit <= 0 ? 0 : Math.max(0, offset) / limit;
        Pageable pageable = PageRequest.of(page, Math.max(1, limit), sortFor(sort));
        return findPage(normalize(query), normalize(category), normalize(transport), pageable).getContent();
    }

    @Override
    default long count(String query, String category, String transport) {
        return countMatching(normalize(query), normalize(category), normalize(transport));
    }

    @Override
    default List<McpServer> searchByAuthor(String authorId, int offset, int limit) {
        int page = limit <= 0 ? 0 : Math.max(0, offset) / limit;
        return findByAuthor(authorId, PageRequest.of(page, Math.max(1, limit))).getContent();
    }

    @Override
    default long countByAuthor(String authorId) {
        return countByAuthorId(authorId);
    }

    @Override
    default List<McpCategoryCount> categories() {
        return categoryCounts().stream()
                .map(row -> new McpCategoryCount((String) row[0], ((Number) row[1]).longValue()))
                .toList();
    }

    private static Sort sortFor(String sort) {
        if ("name".equalsIgnoreCase(sort)) {
            return Sort.by(Sort.Direction.ASC, "name");
        }
        return Sort.by(Sort.Direction.DESC, "createdAt");
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
