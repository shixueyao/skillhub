import { ensureCsrfHeaders, fetchJson, WEB_API_PREFIX } from './client'
import { withBasePath } from '@/shared/lib/base-path'

export type McpTransport = 'STREAMABLE_HTTP' | 'SSE' | 'STDIO'
export type McpPackageType = 'REMOTE' | 'NPM' | 'PYPI' | 'DOCKER' | 'CUSTOM'

export interface McpServerSummary {
  id: number
  slug: string
  name: string
  summary: string | null
  version: string | null
  category: string | null
  transport: McpTransport
  packageType: McpPackageType
  packageName: string | null
  hasAttachment: boolean
  attachmentFilename: string | null
  tags: string[]
  authorId: string
  authorName: string | null
  createdAt: string
  updatedAt: string
}

export interface McpServerDetail extends McpServerSummary {
  description: string | null
  endpointUrl: string | null
  command: string | null
  repositoryUrl: string | null
  docsUrl: string | null
  attachmentFilename: string | null
  attachmentContentType: string | null
  attachmentSizeBytes: number | null
  attachmentSha256: string | null
  attachmentUploadedAt: string | null
  config: Record<string, unknown>
  clientConfig: Record<string, unknown>
}

export interface McpCategory {
  category: string
  count: number
}

export interface McpServerPage {
  items: McpServerSummary[]
  total: number
  page: number
  size: number
}

export interface McpQuery {
  q?: string
  category?: string
  transport?: McpTransport | ''
  sort?: 'newest' | 'name'
  page?: number
  size?: number
}

export interface McpSaveInput {
  name: string
  summary?: string
  description?: string
  version?: string
  category?: string
  transport?: McpTransport
  packageType?: McpPackageType
  packageName?: string
  repositoryUrl?: string
  docsUrl?: string
  tags?: string[]
  config: Record<string, unknown>
}

export interface McpPublishResult {
  id: number
  slug: string
  name: string
}

const MCP_API = `${WEB_API_PREFIX}/mcp-servers`

function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listMcpServers(query: McpQuery = {}, signal?: AbortSignal): Promise<McpServerPage> {
  return fetchJson<McpServerPage>(
    `${MCP_API}${queryString({ ...query, page: query.page ?? 0, size: query.size ?? 24 })}`,
    { signal },
  )
}

export async function listMcpCategories(signal?: AbortSignal): Promise<McpCategory[]> {
  return fetchJson<McpCategory[]>(`${MCP_API}/categories`, { signal })
}

export async function getMcpServer(slug: string, signal?: AbortSignal): Promise<McpServerDetail> {
  return fetchJson<McpServerDetail>(`${MCP_API}/${encodeURIComponent(slug)}`, { signal })
}

export async function listMyMcpServers(page = 0, size = 24, signal?: AbortSignal): Promise<McpServerPage> {
  return fetchJson<McpServerPage>(`${MCP_API}/mine?page=${page}&size=${size}`, { signal })
}

function metadataForm(input: McpSaveInput, file?: File | null): FormData {
  const body = new FormData()
  body.append('metadata', new Blob([JSON.stringify(input)], { type: 'application/json' }))
  if (file) body.append('file', file)
  return body
}

export async function publishMcpServer(input: McpSaveInput, file?: File | null): Promise<McpPublishResult> {
  return fetchJson<McpPublishResult>(MCP_API, {
    method: 'POST',
    headers: await ensureCsrfHeaders(),
    body: metadataForm(input, file),
  })
}

export async function updateMcpServer(id: number, input: McpSaveInput, file?: File | null): Promise<McpServerDetail> {
  return fetchJson<McpServerDetail>(`${MCP_API}/${id}`, {
    method: 'PUT',
    headers: await ensureCsrfHeaders(),
    body: metadataForm(input, file),
  })
}

export function mcpAttachmentUrl(slug: string): string {
  return withBasePath(`${MCP_API}/${encodeURIComponent(slug)}/attachment`)
}

export async function deleteMcpServer(id: number): Promise<void> {
  await fetchJson<null>(`${MCP_API}/${id}`, {
    method: 'DELETE',
    headers: await ensureCsrfHeaders(),
  })
}
