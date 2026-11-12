import { useQuery } from '@tanstack/react-query'
import { withBasePath } from '@/shared/lib/base-path'

export const PAGE_CONTENT_URL = '/site/content/pages.json'

export type ManagedPageKey = 'apps' | 'tools' | 'mcp' | 'skills' | 'suites' | 'plugins'

export const MANAGED_TAB_KEYS = [
  'home',
  'apps',
  'tools',
  'mcp',
  'skills',
  'suites',
  'plugins',
  'publish',
  'mySkills',
  'mySuites',
  'myPlugins',
  'namespaces',
  'dashboard',
  'help',
] as const

export type ManagedTabKey = typeof MANAGED_TAB_KEYS[number]

export type TabLabels = Record<ManagedTabKey, string>

export interface ManagedPageHeader {
  title: string
  description: string
}

export interface PageContent {
  version: 1
  updatedAt: string
  siteName: string
  tabLabels: TabLabels
  pages: Record<ManagedPageKey, ManagedPageHeader>
}

export class PageContentConflictError extends Error {
  constructor() {
    super('page content changed')
    this.name = 'PageContentConflictError'
  }
}

export const MANAGED_PAGE_KEYS: ManagedPageKey[] = ['apps', 'tools', 'mcp', 'skills', 'suites', 'plugins']

export function emptyPageHeader(): ManagedPageHeader {
  return { title: '', description: '' }
}

export function emptyTabLabels(): TabLabels {
  return {
    home: '',
    apps: '',
    tools: '',
    mcp: '',
    skills: '',
    suites: '',
    plugins: '',
    publish: '',
    mySkills: '',
    mySuites: '',
    myPlugins: '',
    namespaces: '',
    dashboard: '',
    help: '',
  }
}

export function emptyPageContent(): PageContent {
  return {
    version: 1,
    updatedAt: '',
    siteName: '',
    tabLabels: emptyTabLabels(),
    pages: {
      apps: emptyPageHeader(),
      tools: emptyPageHeader(),
      mcp: emptyPageHeader(),
      skills: emptyPageHeader(),
      suites: emptyPageHeader(),
      plugins: emptyPageHeader(),
    },
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizePageContent(raw: unknown): PageContent {
  const value = raw && typeof raw === 'object' ? raw as { updatedAt?: unknown; siteName?: unknown; tabLabels?: unknown; pages?: unknown } : {}
  const pages = value.pages && typeof value.pages === 'object'
    ? value.pages as Record<string, unknown>
    : {}
  const result = emptyPageContent()
  result.updatedAt = text(value.updatedAt)
  result.siteName = text(value.siteName)
  const tabLabels = value.tabLabels && typeof value.tabLabels === 'object'
    ? value.tabLabels as Record<string, unknown>
    : {}
  for (const key of MANAGED_TAB_KEYS) {
    result.tabLabels[key] = text(tabLabels[key])
  }
  for (const key of MANAGED_PAGE_KEYS) {
    const entry = pages[key]
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    result.pages[key] = {
      title: text(record.title),
      description: text(record.description),
    }
  }
  return result
}

export async function loadPageContent(signal?: AbortSignal): Promise<PageContent> {
  const response = await fetch(withBasePath(PAGE_CONTENT_URL), {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (response.status === 404) return emptyPageContent()
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return normalizePageContent(await response.json())
}

export async function savePageContent(
  content: PageContent,
  expectedUpdatedAt: string,
): Promise<PageContent> {
  const current = await loadPageContent()
  if (expectedUpdatedAt && current.updatedAt && current.updatedAt !== expectedUpdatedAt) {
    throw new PageContentConflictError()
  }
  const next: PageContent = {
    version: 1,
    updatedAt: new Date().toISOString(),
    siteName: content.siteName.trim(),
    tabLabels: { ...content.tabLabels },
    pages: {
      apps: { ...content.pages.apps },
      tools: { ...content.pages.tools },
      mcp: { ...content.pages.mcp },
      skills: { ...content.pages.skills },
      suites: { ...content.pages.suites },
      plugins: { ...content.pages.plugins },
    },
  }
  const response = await fetch(withBasePath(PAGE_CONTENT_URL), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(next, null, 2),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return next
}

/**
 * Reads the admin-managed title/description for a public feature page.
 * Empty values fall back to the localized defaults supplied by the page.
 */
export function usePageHeader(
  key: ManagedPageKey,
  defaultTitle: string,
  defaultDescription: string,
): ManagedPageHeader {
  const { data } = useQuery({
    queryKey: ['page-content', 'content'],
    queryFn: ({ signal }) => loadPageContent(signal),
    retry: false,
    staleTime: 0,
    meta: { skipGlobalErrorHandler: true },
  })
  const header = data?.pages[key]
  return {
    title: header?.title || defaultTitle,
    description: header?.description || defaultDescription,
  }
}
