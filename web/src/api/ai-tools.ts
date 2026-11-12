import { ensureCsrfHeaders, fetchJson, WEB_API_PREFIX } from './client'
import { withBasePath } from '@/shared/lib/base-path'

export interface AiToolSummary {
  id: number
  name: string
  version: string | null
  summary: string | null
  category: string | null
  filename: string
  contentType: string
  sizeBytes: number
  downloadCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface AiToolDetail extends AiToolSummary {
  usageInstructions: string | null
  sha256: string
}

export interface AiToolCategory {
  category: string
  count: number
}

export interface AiToolPage {
  items: AiToolSummary[]
  total: number
  page: number
  size: number
}

export interface AiToolQuery {
  q?: string
  category?: string
  sort?: 'newest' | 'downloads' | 'name'
  page?: number
  size?: number
}

export interface AiToolMetadataInput {
  name: string
  version?: string
  summary?: string
  usageInstructions?: string
  category?: string
}

export interface AiToolPublishResult {
  id: number
  name: string
  filename: string
}

const TOOL_API = `${WEB_API_PREFIX}/ai-tools`

function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listAiTools(query: AiToolQuery = {}, signal?: AbortSignal): Promise<AiToolPage> {
  return fetchJson<AiToolPage>(
    `${TOOL_API}${queryString({ ...query, page: query.page ?? 0, size: query.size ?? 24 })}`,
    { signal },
  )
}

export async function listAiToolCategories(signal?: AbortSignal): Promise<AiToolCategory[]> {
  return fetchJson<AiToolCategory[]>(`${TOOL_API}/categories`, { signal })
}

export async function getAiTool(id: number, signal?: AbortSignal): Promise<AiToolDetail> {
  return fetchJson<AiToolDetail>(`${TOOL_API}/${id}`, { signal })
}

export async function publishAiTool(file: File, input: AiToolMetadataInput): Promise<AiToolPublishResult> {
  const body = new FormData()
  body.append('file', file)
  body.append('name', input.name)
  if (input.version) body.append('version', input.version)
  if (input.summary) body.append('summary', input.summary)
  if (input.usageInstructions) body.append('usageInstructions', input.usageInstructions)
  if (input.category) body.append('category', input.category)
  return fetchJson<AiToolPublishResult>(TOOL_API, {
    method: 'POST',
    headers: await ensureCsrfHeaders(),
    body,
    timeoutMs: 120_000,
  })
}

export async function updateAiTool(id: number, input: AiToolMetadataInput): Promise<AiToolDetail> {
  return fetchJson<AiToolDetail>(`${TOOL_API}/${id}`, {
    method: 'PUT',
    headers: await ensureCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })
}

export async function deleteAiTool(id: number): Promise<void> {
  await fetchJson<null>(`${TOOL_API}/${id}`, {
    method: 'DELETE',
    headers: await ensureCsrfHeaders(),
  })
}

export function aiToolDownloadUrl(id: number): string {
  return withBasePath(`${TOOL_API}/${id}/download`)
}
