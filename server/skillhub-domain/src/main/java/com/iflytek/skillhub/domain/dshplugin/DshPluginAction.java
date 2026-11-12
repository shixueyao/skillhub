package com.iflytek.skillhub.domain.dshplugin;

/** Actions a caller may perform on a hosted DSH plugin. */
public enum DshPluginAction {
    PUBLISH_VERSION,
    UPDATE_METADATA,
    YANK_VERSION,
    UNYANK_VERSION,
    DELETE_VERSION,
    RECOMMEND_VERSION,
    HIDE,
    RESTORE
}
