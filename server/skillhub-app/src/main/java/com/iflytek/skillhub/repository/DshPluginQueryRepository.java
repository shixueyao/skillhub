package com.iflytek.skillhub.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.iflytek.skillhub.dto.DshPluginCategoryResponse;
import com.iflytek.skillhub.dto.DshPluginDetailResponse;
import com.iflytek.skillhub.dto.DshPluginSummaryResponse;
import com.iflytek.skillhub.dto.DshPluginVersionResponse;
import com.iflytek.skillhub.dto.PageResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Read model for the DSH plugin catalog.
 *
 * <p>Catalog presentation joins namespace identity, publisher display name and
 * the latest version pointer in one query. Writes still go through the domain
 * aggregate; this repository never mutates state.
 */
@Repository
public class DshPluginQueryRepository {

    private static final String VISIBLE = " WHERE p.hidden = FALSE AND p.status = 'ACTIVE'";

    private static final String SELECT = """
            SELECT p.id, p.namespace_id, n.slug AS namespace_slug,
                   n.display_name AS namespace_display_name, p.slug, p.package_name,
                   p.display_name, p.summary, p.description, p.homepage, p.license,
                   p.category, p.tags::text AS tags_json, p.status, p.latest_version_id,
                   p.download_count, p.hidden, p.created_by,
                   COALESCE(u.display_name, p.created_by) AS created_by_name,
                   p.created_at, p.updated_at,
                   v.version AS latest_version, v.published_at AS latest_published_at,
                   (SELECT COUNT(*) FROM dsh_plugin_version vv
                     WHERE vv.plugin_id = p.id AND vv.status = 'PUBLISHED') AS version_count
            FROM dsh_plugin p
            JOIN namespace n ON n.id = p.namespace_id
            LEFT JOIN user_account u ON u.id = p.created_by
            LEFT JOIN dsh_plugin_version v ON v.id = p.latest_version_id
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public DshPluginQueryRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public PageResponse<DshPluginSummaryResponse> search(String query,
                                                         String category,
                                                         String tag,
                                                         String sort,
                                                         int page,
                                                         int size) {
        List<Object> arguments = new ArrayList<>();
        StringBuilder where = new StringBuilder(VISIBLE);
        appendSearch(where, arguments, query);
        if (category != null && !category.isBlank()) {
            where.append(" AND p.category = ?");
            arguments.add(category);
        }
        if (tag != null && !tag.isBlank()) {
            where.append(" AND p.tags @> ?::jsonb");
            arguments.add("[\"" + escapeJson(tag) + "\"]");
        }

        long total = count(where, arguments);
        List<Object> pageArguments = new ArrayList<>(arguments);
        pageArguments.add(size);
        pageArguments.add((long) page * size);
        List<DshPluginSummaryResponse> items = jdbc.query(
                SELECT + where + " ORDER BY " + orderBy(sort) + " LIMIT ? OFFSET ?",
                summaryMapper(), pageArguments.toArray());
        return new PageResponse<>(items, total, page, size);
    }

    public PageResponse<DshPluginSummaryResponse> findMine(String userId,
                                                           java.util.Set<Long> adminNamespaceIds,
                                                           String query,
                                                           int page,
                                                           int size) {
        List<Object> arguments = new ArrayList<>();
        StringBuilder where = new StringBuilder();
        if (adminNamespaceIds == null || adminNamespaceIds.isEmpty()) {
            where.append(" WHERE p.created_by = ?");
            arguments.add(userId);
        } else {
            where.append(" WHERE (p.created_by = ? OR p.namespace_id IN (");
            arguments.add(userId);
            int index = 0;
            for (Long namespaceId : adminNamespaceIds) {
                if (index++ > 0) {
                    where.append(", ");
                }
                where.append('?');
                arguments.add(namespaceId);
            }
            where.append("))");
        }
        appendSearch(where, arguments, query);

        long total = count(where, arguments);
        List<Object> pageArguments = new ArrayList<>(arguments);
        pageArguments.add(size);
        pageArguments.add((long) page * size);
        List<DshPluginSummaryResponse> items = jdbc.query(
                SELECT + where + " ORDER BY p.updated_at DESC, p.id DESC LIMIT ? OFFSET ?",
                summaryMapper(), pageArguments.toArray());
        return new PageResponse<>(items, total, page, size);
    }

    public Optional<DshPluginDetailResponse> findDetail(String namespaceSlug, String slug) {
        return jdbc.query(
                        SELECT + " WHERE n.slug = ? AND p.slug = ?",
                        detailMapper(),
                        namespaceSlug,
                        slug)
                .stream()
                .findFirst();
    }

    public List<DshPluginCategoryResponse> categories() {
        return jdbc.query("""
                SELECT p.category, COUNT(*) AS plugin_count
                FROM dsh_plugin p
                WHERE p.hidden = FALSE AND p.status = 'ACTIVE'
                  AND p.category IS NOT NULL AND p.category <> ''
                GROUP BY p.category
                ORDER BY p.category
                """,
                (result, row) -> new DshPluginCategoryResponse(
                        result.getString("category"), result.getLong("plugin_count")));
    }

    public List<DshPluginVersionResponse> findVersions(Long pluginId, Long recommendedVersionId) {
        return jdbc.query("""
                SELECT id, version, status, sha256, size_bytes, manifest::text AS manifest_json,
                       compat_note, release_notes, download_count, published_at, published_by,
                       yanked_at, yanked_by, yank_reason
                FROM dsh_plugin_version
                WHERE plugin_id = ?
                ORDER BY published_at DESC, id DESC
                """,
                (result, row) -> mapVersion(result, recommendedVersionId),
                pluginId);
    }

    private long count(StringBuilder where, List<Object> arguments) {
        Long total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dsh_plugin p" + where,
                Long.class,
                arguments.toArray());
        return total == null ? 0 : total;
    }

    private void appendSearch(StringBuilder where, List<Object> arguments, String query) {
        if (query == null || query.isBlank()) {
            return;
        }
        String pattern = "%" + query.trim().toLowerCase(Locale.ROOT) + "%";
        where.append("""
                 AND (LOWER(p.package_name) LIKE ?
                   OR LOWER(p.display_name) LIKE ?
                   OR LOWER(COALESCE(p.summary, '')) LIKE ?
                   OR LOWER(COALESCE(p.category, '')) LIKE ?)
                """);
        arguments.add(pattern);
        arguments.add(pattern);
        arguments.add(pattern);
        arguments.add(pattern);
    }

    private String orderBy(String sort) {
        if ("downloads".equals(sort)) {
            return "p.download_count DESC, p.created_at DESC";
        }
        if ("name".equals(sort)) {
            return "LOWER(p.display_name) ASC, p.id ASC";
        }
        if ("updated".equals(sort)) {
            return "p.updated_at DESC, p.id DESC";
        }
        return "v.published_at DESC NULLS LAST, p.created_at DESC, p.id DESC";
    }

    private RowMapper<DshPluginSummaryResponse> summaryMapper() {
        return (result, row) -> new DshPluginSummaryResponse(
                result.getLong("id"),
                result.getString("namespace_slug"),
                result.getString("namespace_display_name"),
                result.getString("slug"),
                result.getString("package_name"),
                result.getString("display_name"),
                result.getString("summary"),
                result.getString("category"),
                tags(result.getString("tags_json")),
                result.getString("latest_version"),
                instant(result, "latest_published_at"),
                result.getLong("version_count"),
                result.getLong("download_count"),
                result.getBoolean("hidden"),
                result.getString("created_by"),
                result.getString("created_by_name"),
                instant(result, "created_at"),
                instant(result, "updated_at"));
    }

    private RowMapper<DshPluginDetailResponse> detailMapper() {
        return (result, row) -> new DshPluginDetailResponse(
                result.getLong("id"),
                result.getLong("namespace_id"),
                result.getString("namespace_slug"),
                result.getString("namespace_display_name"),
                result.getString("slug"),
                result.getString("package_name"),
                result.getString("display_name"),
                result.getString("summary"),
                result.getString("description"),
                result.getString("homepage"),
                result.getString("license"),
                result.getString("category"),
                tags(result.getString("tags_json")),
                result.getString("status"),
                result.getBoolean("hidden"),
                result.getObject("latest_version_id", Long.class),
                result.getString("latest_version"),
                result.getLong("download_count"),
                result.getString("created_by"),
                result.getString("created_by_name"),
                instant(result, "created_at"),
                instant(result, "updated_at"),
                java.util.Set.of(),
                List.of());
    }

    private DshPluginVersionResponse mapVersion(ResultSet result, Long recommendedVersionId) throws SQLException {
        JsonNode manifest = manifest(result.getString("manifest_json"));
        return new DshPluginVersionResponse(
                result.getLong("id"),
                result.getString("version"),
                result.getString("status"),
                result.getString("sha256"),
                result.getLong("size_bytes"),
                stringList(manifest.path("capabilities")),
                stringMap(manifest.path("engines")),
                stringMap(manifest.path("peerDependencies")),
                result.getString("compat_note"),
                result.getString("release_notes"),
                result.getLong("download_count"),
                instant(result, "published_at"),
                result.getString("published_by"),
                instant(result, "yanked_at"),
                result.getString("yanked_by"),
                result.getString("yank_reason"),
                recommendedVersionId != null
                        && recommendedVersionId.equals(result.getObject("id", Long.class)));
    }

    private JsonNode manifest(String json) {
        if (json == null || json.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(json);
        } catch (Exception exception) {
            return objectMapper.createObjectNode();
        }
    }

    private List<String> tags(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            return stringList(node);
        } catch (Exception exception) {
            return List.of();
        }
    }

    private List<String> stringList(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            if (item.isTextual()) {
                values.add(item.asText());
            }
        }
        return List.copyOf(values);
    }

    private Map<String, String> stringMap(JsonNode node) {
        if (node == null || !node.isObject()) {
            return Map.of();
        }
        Map<String, String> values = new LinkedHashMap<>();
        node.fields().forEachRemaining(field -> {
            if (field.getValue().isTextual()) {
                values.put(field.getKey(), field.getValue().asText());
            }
        });
        return Map.copyOf(values);
    }

    private static Instant instant(ResultSet result, String column) throws SQLException {
        java.sql.Timestamp value = result.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
