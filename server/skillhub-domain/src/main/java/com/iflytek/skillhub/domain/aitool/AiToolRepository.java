package com.iflytek.skillhub.domain.aitool;

import java.util.List;
import java.util.Optional;

/** Persistence contract for admin-published downloadable AI tools. */
public interface AiToolRepository {

    AiTool save(AiTool tool);

    Optional<AiTool> findById(Long id);

    void delete(AiTool tool);

    List<AiTool> search(String query, String category, String sort, int offset, int limit);

    long count(String query, String category);

    List<AiToolCategoryCount> categories();

    void incrementDownloadCount(Long id);
}
