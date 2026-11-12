package com.iflytek.skillhub.domain.dshplugin;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;

/**
 * Serializes plugin tags to the {@code jsonb} array stored on the aggregate.
 *
 * <p>Tags are a small, fixed shape. Keeping the JSON handling here avoids leaking
 * storage representation into services and guarantees the stored column stays a
 * valid JSON array even when a tag contains quotes or control characters.
 */
final class DshPluginTags {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };

    private DshPluginTags() {
    }

    static String toJson(List<String> tags) {
        try {
            return MAPPER.writeValueAsString(tags == null ? List.of() : tags);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize DSH plugin tags", exception);
        }
    }

    static List<String> fromJson(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return List.copyOf(MAPPER.readValue(json, STRING_LIST));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to read DSH plugin tags", exception);
        }
    }
}
