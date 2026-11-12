package com.iflytek.skillhub.dto;

import jakarta.validation.constraints.Size;

/** Reason recorded when a plugin version is withdrawn from distribution. */
public record DshPluginYankRequest(@Size(max = 2000) String reason) {
}
