import { withBasePath } from '@/shared/lib/base-path'

export const HOME_CONTENT_URL = '/site/content/home.json'
export const HOME_CONTENT_DEFAULT_URL = '/site/home.default.json'

export type PortalNoticeLevel = 'info' | 'warn' | 'success' | 'danger'
export type PortalSectionLayout = 'grid' | 'list'

export interface PortalHomeItem {
  title: string
  body: string
  linkText: string
  linkUrl: string
  icon: string
  category: string
  tags: string[]
  showOnHome: boolean
}

export interface PortalHomeSection {
  id: string
  title: string
  description: string
  layout: PortalSectionLayout
  items: PortalHomeItem[]
}

export interface PortalHomeContent {
  version: number
  updatedAt: string
  enabled: boolean
  homeManagedByApp: boolean
  notice: {
    enabled: boolean
    level: PortalNoticeLevel
    text: string
  }
  hero: {
    title: string
    description: string
    primaryButtonText: string
    primaryButtonUrl: string
  }
  sections: PortalHomeSection[]
  footerNote: string
  nav: Record<string, unknown>
}

const NOTICE_LEVELS: PortalNoticeLevel[] = ['info', 'warn', 'success', 'danger']

export function emptyPortalHomeContent(): PortalHomeContent {
  return {
    version: 2,
    updatedAt: '',
    enabled: true,
    homeManagedByApp: true,
    notice: { enabled: false, level: 'info', text: '' },
    hero: { title: '', description: '', primaryButtonText: '', primaryButtonUrl: '' },
    sections: [],
    footerNote: '',
    nav: {},
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeItem(raw: unknown): PortalHomeItem | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const title = text(value.title)
  const linkUrl = text(value.linkUrl)
  if (!title && !linkUrl) return null
  return {
    title,
    body: text(value.body),
    linkText: text(value.linkText),
    linkUrl,
    icon: text(value.icon),
    category: text(value.category),
    tags: Array.isArray(value.tags)
      ? value.tags.map((tag) => text(tag)).filter(Boolean).slice(0, 10)
      : [],
    showOnHome: value.showOnHome === true,
  }
}

function normalizeSection(raw: unknown, index: number): PortalHomeSection | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const items = Array.isArray(value.items)
    ? value.items.map(normalizeItem).filter((item): item is PortalHomeItem => item !== null)
    : []
  const title = text(value.title)
  if (!title && items.length === 0) return null
  return {
    id: text(value.id) || `section-${index + 1}`,
    title: title || `Section ${index + 1}`,
    description: text(value.description),
    layout: value.layout === 'list' ? 'list' : 'grid',
    items,
  }
}

/**
 * Normalizes the LAN homepage document. Legacy `cards` documents are migrated
 * into one section so an existing `home.json` keeps rendering after the portal
 * homepage takes over.
 */
export function normalizeHomeContent(raw: unknown): PortalHomeContent {
  const content = emptyPortalHomeContent()
  if (!raw || typeof raw !== 'object') return content
  const value = raw as Record<string, unknown>

  content.version = 2
  content.updatedAt = text(value.updatedAt)
  content.enabled = value.enabled !== false
  content.homeManagedByApp = value.homeManagedByApp !== false

  const notice = (value.notice ?? {}) as Record<string, unknown>
  content.notice = {
    enabled: notice.enabled === true,
    level: NOTICE_LEVELS.includes(notice.level as PortalNoticeLevel)
      ? notice.level as PortalNoticeLevel
      : 'info',
    text: text(notice.text),
  }

  const hero = (value.hero ?? {}) as Record<string, unknown>
  content.hero = {
    title: text(hero.title),
    description: text(hero.description),
    primaryButtonText: text(hero.primaryButtonText),
    primaryButtonUrl: text(hero.primaryButtonUrl),
  }

  content.footerNote = text(value.footerNote)
  content.nav = (value.nav && typeof value.nav === 'object')
    ? value.nav as Record<string, unknown>
    : {}

  const sections = Array.isArray(value.sections)
    ? value.sections
      .map((section, index) => normalizeSection(section, index))
      .filter((section): section is PortalHomeSection => section !== null)
    : []
  if (sections.length > 0) {
    content.sections = sections
  } else if (Array.isArray(value.cards)) {
    const items = value.cards
      .map(normalizeItem)
      .filter((item): item is PortalHomeItem => item !== null)
    content.sections = items.length > 0
      ? [{
        id: 'apps',
        title: text(value.cardsTitle) || 'AI Apps',
        description: '',
        layout: 'grid',
        items,
      }]
      : []
  }

  return content
}

export class HomeContentConflictError extends Error {
  constructor() {
    super('HOME_CONTENT_CONFLICT')
    this.name = 'HomeContentConflictError'
  }
}

async function readContent(url: string, signal?: AbortSignal): Promise<PortalHomeContent> {
  const response = await fetch(withBasePath(url), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return normalizeHomeContent(await response.json())
}

export function loadHomeContent(signal?: AbortSignal): Promise<PortalHomeContent> {
  return readContent(HOME_CONTENT_URL, signal)
}

export function loadDefaultHomeContent(signal?: AbortSignal): Promise<PortalHomeContent> {
  return readContent(HOME_CONTENT_DEFAULT_URL, signal)
}

export async function saveHomeContent(
  content: PortalHomeContent,
  expectedUpdatedAt: string,
): Promise<PortalHomeContent> {
  const latest = await loadHomeContent()
  if (expectedUpdatedAt && latest.updatedAt !== expectedUpdatedAt) {
    throw new HomeContentConflictError()
  }
  const payload: PortalHomeContent = {
    ...content,
    version: 2,
    updatedAt: new Date().toISOString(),
    homeManagedByApp: true,
  }
  const response = await fetch(withBasePath(HOME_CONTENT_URL), {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload, null, 2),
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error('AUTH_REQUIRED')
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return payload
}

export function createPortalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
