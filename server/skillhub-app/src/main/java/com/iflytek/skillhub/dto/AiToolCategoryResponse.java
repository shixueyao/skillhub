package com.iflytek.skillhub.dto;

/** One category and the number of published tools in it. */
public record AiToolCategoryResponse(String category, long count) {
}
