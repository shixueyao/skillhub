-- AI tool downloads: admin-published files with category, summary and usage
-- instructions. Kept separate from skills and DSH plugins because a tool is a
-- single downloadable artifact, not a versioned skill package or npm tarball.

CREATE TABLE ai_tool (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    version VARCHAR(64),
    summary TEXT,
    usage_instructions TEXT,
    category VARCHAR(64),
    filename VARCHAR(512) NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    content_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    download_count BIGINT NOT NULL DEFAULT 0,
    created_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(128),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_tool_created_at ON ai_tool(created_at DESC);
CREATE INDEX idx_ai_tool_category ON ai_tool(category);
CREATE INDEX idx_ai_tool_download_count ON ai_tool(download_count DESC);
