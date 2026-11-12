package com.iflytek.skillhub.dto;

/** A category label and the number of visible plugins using it. */
public record DshPluginCategoryResponse(String name, long count) {
}
