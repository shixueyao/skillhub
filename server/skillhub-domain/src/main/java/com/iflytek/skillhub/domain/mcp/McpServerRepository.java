package com.iflytek.skillhub.domain.mcp;

import java.util.List;
import java.util.Optional;

/** Persistence contract for user-published MCP server definitions. */
public interface McpServerRepository {

    McpServer save(McpServer server);

    Optional<McpServer> findById(Long id);

    Optional<McpServer> findBySlug(String slug);

    void delete(McpServer server);

    List<McpServer> search(String query, String category, String transport, String sort, int offset, int limit);

    long count(String query, String category, String transport);

    List<McpServer> searchByAuthor(String authorId, int offset, int limit);

    long countByAuthor(String authorId);

    List<McpCategoryCount> categories();

    boolean slugExists(String slug);
}
