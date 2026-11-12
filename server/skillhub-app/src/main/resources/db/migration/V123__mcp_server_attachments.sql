-- MCP attachments: users may package the files needed by a server and make
-- them downloadable from the public MCP detail page.

ALTER TABLE mcp_server
    ADD COLUMN attachment_filename VARCHAR(512),
    ADD COLUMN attachment_storage_key VARCHAR(512),
    ADD COLUMN attachment_content_type VARCHAR(128),
    ADD COLUMN attachment_size_bytes BIGINT,
    ADD COLUMN attachment_sha256 VARCHAR(64),
    ADD COLUMN attachment_uploaded_at TIMESTAMPTZ;
