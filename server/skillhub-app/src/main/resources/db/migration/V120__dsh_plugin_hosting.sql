-- DSH plugin hosting: namespace-scoped, versioned distribution of DeepSeek Harness
-- plugin tarballs. Kept separate from skill so package identity, SemVer and the
-- generated `dsh plugin add <url>` coordinates do not overload the SKILL.md model.

CREATE TABLE dsh_plugin (
    id BIGSERIAL PRIMARY KEY,
    namespace_id BIGINT NOT NULL REFERENCES namespace(id),
    slug VARCHAR(128) NOT NULL,
    package_name VARCHAR(214) NOT NULL,
    display_name VARCHAR(256) NOT NULL,
    summary TEXT,
    description TEXT,
    homepage VARCHAR(512),
    license VARCHAR(64),
    category VARCHAR(64),
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    latest_version_id BIGINT,
    download_count BIGINT NOT NULL DEFAULT 0,
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_at TIMESTAMPTZ,
    hidden_by VARCHAR(128),
    created_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(128),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_dsh_plugin_namespace_slug UNIQUE (namespace_id, slug),
    CONSTRAINT uk_dsh_plugin_package_name UNIQUE (package_name)
);

CREATE INDEX idx_dsh_plugin_namespace_status
    ON dsh_plugin(namespace_id, status);

CREATE INDEX idx_dsh_plugin_created_at
    ON dsh_plugin(created_at DESC);

CREATE INDEX idx_dsh_plugin_category
    ON dsh_plugin(category);

CREATE TABLE dsh_plugin_version (
    id BIGSERIAL PRIMARY KEY,
    plugin_id BIGINT NOT NULL REFERENCES dsh_plugin(id) ON DELETE CASCADE,
    version VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
    tarball_key VARCHAR(512) NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    compat_note TEXT,
    release_notes TEXT,
    download_count BIGINT NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_by VARCHAR(128) NOT NULL,
    yanked_at TIMESTAMPTZ,
    yanked_by VARCHAR(128),
    yank_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_dsh_plugin_version UNIQUE (plugin_id, version)
);

CREATE INDEX idx_dsh_plugin_version_plugin
    ON dsh_plugin_version(plugin_id, published_at DESC);

CREATE INDEX idx_dsh_plugin_version_sha256
    ON dsh_plugin_version(sha256);

ALTER TABLE dsh_plugin
    ADD CONSTRAINT fk_dsh_plugin_latest_version
    FOREIGN KEY (latest_version_id) REFERENCES dsh_plugin_version(id) ON DELETE SET NULL;
