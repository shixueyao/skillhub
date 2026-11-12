-- MCP server registry: user-published remote endpoints, stdio commands/packages
-- and pasted client configuration. The canonical client config is stored as
-- JSON text; display/filter columns are derived at publish time.

CREATE TABLE mcp_server (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(96) NOT NULL UNIQUE,
    name VARCHAR(256) NOT NULL,
    summary TEXT,
    description TEXT,
    version VARCHAR(64),
    category VARCHAR(64),
    transport VARCHAR(32) NOT NULL,
    endpoint_url VARCHAR(2048),
    command VARCHAR(512),
    package_type VARCHAR(32) NOT NULL DEFAULT 'CUSTOM',
    package_name VARCHAR(512),
    repository_url VARCHAR(2048),
    docs_url VARCHAR(2048),
    config_json TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    author_id VARCHAR(128) NOT NULL,
    author_name VARCHAR(256),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mcp_server_created_at ON mcp_server(created_at DESC);
CREATE INDEX idx_mcp_server_category ON mcp_server(category);
CREATE INDEX idx_mcp_server_transport ON mcp_server(transport);
CREATE INDEX idx_mcp_server_author ON mcp_server(author_id);
