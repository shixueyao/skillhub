import { fetchJson, getCsrfHeaders, WEB_API_PREFIX } from './client'
import type { components } from './generated/schema'
import { withBasePath } from '@/shared/lib/base-path'

/**
 * Wire types generated from the backend OpenAPI document. The server always
 * emits these fields; `Solid` removes the optional marker Springdoc adds to
 * response records so pages do not repeat null checks for required values.
 */
type Solid<T> = { [K in keyof T]-?: NonNullable<T[K]> }

export type DshPluginSummary = Solid<components['schemas']['DshPluginSummaryResponse']>
export type DshPluginVersion = Solid<components['schemas']['DshPluginVersionResponse']>
export type DshPluginDetail = Omit<Solid<components['schemas']['DshPluginDetailResponse']>, 'versions'> & {
  versions: DshPluginVersion[]
}
export type DshPluginCategory = Solid<components['schemas']['DshPluginCategoryResponse']>
export type DshPluginPackagePreview = components['schemas']['DshPluginPackagePreviewResponse']
export type DshPluginPublishResult = Solid<components['schemas']['DshPluginPublishResponse']>
export type DshPluginPage = {
  items: DshPluginSummary[]
  total: number
  page: number
  size: number
}

export type DshPluginAction =
  | 'PUBLISH_VERSION'
  | 'UPDATE_METADATA'
  | 'YANK_VERSION'
  | 'UNYANK_VERSION'
  | 'DELETE_VERSION'
  | 'RECOMMEND_VERSION'
  | 'HIDE'
  | 'RESTORE'

export type DshPluginSort = 'newest' | 'downloads' | 'name' | 'updated'

export interface DshPluginQuery {
  q?: string
  category?: string
  tag?: string
  sort?: DshPluginSort
  page?: number
  size?: number
}

export interface DshPluginMetadataInput {
  displayName?: string
  summary?: string
  description?: string
  homepage?: string
  license?: string
  category?: string
  tags?: string[]
}

export interface DshPluginPublishInput extends DshPluginMetadataInput {
  compatNote?: string
  releaseNotes?: string
}

const PLUGIN_API = `${WEB_API_PREFIX}/dsh-plugins`
const PUBLISH_TIMEOUT_MS = 60_000

function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.set(key, String(value))
    }
  })
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

function cleanNamespace(namespace: string): string {
  return namespace.startsWith('@') ? namespace.slice(1) : namespace
}

export async function listDshPlugins(query: DshPluginQuery = {}, signal?: AbortSignal): Promise<DshPluginPage> {
  return fetchJson<DshPluginPage>(
    `${PLUGIN_API}${queryString({ ...query, page: query.page ?? 0, size: query.size ?? 12 })}`,
    { signal },
  )
}

export async function listDshPluginCategories(signal?: AbortSignal): Promise<DshPluginCategory[]> {
  return fetchJson<DshPluginCategory[]>(`${PLUGIN_API}/categories`, { signal })
}

export async function getDshPlugin(
  namespace: string,
  slug: string,
  signal?: AbortSignal,
): Promise<DshPluginDetail> {
  return fetchJson<DshPluginDetail>(
    `${PLUGIN_API}/${encodeURIComponent(cleanNamespace(namespace))}/${encodeURIComponent(slug)}`,
    { signal },
  )
}

export async function listMyDshPlugins(
  query: { q?: string; page?: number; size?: number } = {},
  signal?: AbortSignal,
): Promise<DshPluginPage> {
  return fetchJson<DshPluginPage>(
    `${PLUGIN_API}/mine${queryString({ ...query, page: query.page ?? 0, size: query.size ?? 12 })}`,
    { signal },
  )
}

export async function previewDshPluginPackage(
  namespace: string,
  file: File,
): Promise<DshPluginPackagePreview> {
  const body = new FormData()
  body.append('file', file)
  body.append('namespace', cleanNamespace(namespace))
  return fetchJson<DshPluginPackagePreview>(`${PLUGIN_API}/package-preview`, {
    method: 'POST',
    headers: getCsrfHeaders(),
    body,
    timeoutMs: PUBLISH_TIMEOUT_MS,
  })
}

export async function publishDshPlugin(
  namespace: string,
  file: File,
  input: DshPluginPublishInput,
): Promise<DshPluginPublishResult> {
  const body = new FormData()
  body.append('file', file)
  appendIfPresent(body, 'displayName', input.displayName)
  appendIfPresent(body, 'summary', input.summary)
  appendIfPresent(body, 'description', input.description)
  appendIfPresent(body, 'homepage', input.homepage)
  appendIfPresent(body, 'license', input.license)
  appendIfPresent(body, 'category', input.category)
  appendIfPresent(body, 'compatNote', input.compatNote)
  appendIfPresent(body, 'releaseNotes', input.releaseNotes)
  if (input.tags?.length) {
    body.append('tags', input.tags.join(','))
  }
  return fetchJson<DshPluginPublishResult>(
    `${PLUGIN_API}/${encodeURIComponent(cleanNamespace(namespace))}/publish`,
    {
      method: 'POST',
      headers: getCsrfHeaders(),
      body,
      timeoutMs: PUBLISH_TIMEOUT_MS,
    },
  )
}

export async function updateDshPlugin(
  pluginId: number,
  input: DshPluginMetadataInput,
): Promise<DshPluginDetail> {
  return fetchJson<DshPluginDetail>(`${PLUGIN_API}/${pluginId}`, {
    method: 'PUT',
    headers: getCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })
}

export async function yankDshPluginVersion(
  pluginId: number,
  versionId: number,
  reason?: string,
): Promise<DshPluginDetail> {
  return fetchJson<DshPluginDetail>(`${PLUGIN_API}/${pluginId}/versions/${versionId}/yank`, {
    method: 'POST',
    headers: getCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reason }),
  })
}

export async function unyankDshPluginVersion(
  pluginId: number,
  versionId: number,
): Promise<DshPluginDetail> {
  return fetchJson<DshPluginDetail>(`${PLUGIN_API}/${pluginId}/versions/${versionId}/unyank`, {
    method: 'POST',
    headers: getCsrfHeaders(),
  })
}

export async function recommendDshPluginVersion(
  pluginId: number,
  versionId: number,
): Promise<DshPluginDetail> {
  return fetchJson<DshPluginDetail>(`${PLUGIN_API}/${pluginId}/versions/${versionId}/recommend`, {
    method: 'POST',
    headers: getCsrfHeaders(),
  })
}

export async function deleteDshPluginVersion(
  pluginId: number,
  versionId: number,
): Promise<DshPluginDetail> {
  return fetchJson<DshPluginDetail>(`${PLUGIN_API}/${pluginId}/versions/${versionId}`, {
    method: 'DELETE',
    headers: getCsrfHeaders(),
  })
}

export async function setDshPluginHidden(
  pluginId: number,
  hidden: boolean,
): Promise<DshPluginDetail> {
  return fetchJson<DshPluginDetail>(`${PLUGIN_API}/${pluginId}/${hidden ? 'hide' : 'restore'}`, {
    method: 'POST',
    headers: getCsrfHeaders(),
  })
}

export function dshPluginDownloadPath(
  namespace: string,
  slug: string,
  version: string,
): string {
  return `${PLUGIN_API}/${encodeURIComponent(cleanNamespace(namespace))}/${encodeURIComponent(slug)}`
    + `/versions/${encodeURIComponent(version)}/download`
}

export function dshPluginDownloadUrl(
  namespace: string,
  slug: string,
  version: string,
): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}${withBasePath(dshPluginDownloadPath(namespace, slug, version))}`
}

export function dshPluginInstallCommand(
  namespace: string,
  slug: string,
  version: string,
): string {
  return `dsh plugin --profile web add ${dshPluginDownloadUrl(namespace, slug, version)}`
}

function appendIfPresent(body: FormData, key: string, value?: string) {
  if (value !== undefined && value.trim() !== '') {
    body.append(key, value.trim())
  }
}
