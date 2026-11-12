import { withBasePath } from '@/shared/lib/base-path'

export const HELP_CONTENT_URL = '/site/content/help.json'
export const HELP_CONTENT_BASE = '/site/content/'
export const HELP_ARTICLE_PREFIX = 'help/'

export interface HelpArticle {
  id: string
  title: string
  summary: string
  file: string
  builtin: boolean
  updatedAt: string
}

export interface HelpContent {
  version: 1
  updatedAt: string
  articles: HelpArticle[]
}

export interface HelpArticleDraft {
  id: string
  title: string
  summary: string
  content: string
}

export class HelpContentConflictError extends Error {
  constructor() {
    super('help content changed')
    this.name = 'HelpContentConflictError'
  }
}

const ARTICLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidHelpArticleId(value: string): boolean {
  return ARTICLE_ID.test(value) && value.length <= 80
}

export function helpArticleFile(id: string): string {
  return `${HELP_ARTICLE_PREFIX}${id}.md`
}

function articlePath(file: string): string {
  return withBasePath(`${HELP_CONTENT_BASE}${file.replace(/^\/+/, '')}`)
}

function normalizeArticle(raw: Partial<HelpArticle>): HelpArticle | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!id || !isValidHelpArticleId(id) || !title) return null
  return {
    id,
    title,
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    file: typeof raw.file === 'string' && raw.file.startsWith(HELP_ARTICLE_PREFIX)
      ? raw.file
      : helpArticleFile(id),
    builtin: raw.builtin === true,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  }
}

export function normalizeHelpContent(raw: unknown): HelpContent {
  const value = raw && typeof raw === 'object' ? raw as Partial<HelpContent> : {}
  const seen = new Set<string>()
  const articles = (Array.isArray(value.articles) ? value.articles : [])
    .map((article) => normalizeArticle(article as Partial<HelpArticle>))
    .filter((article): article is HelpArticle => {
      if (!article || seen.has(article.id)) return false
      seen.add(article.id)
      return true
    })
  return {
    version: 1,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    articles,
  }
}

export async function loadHelpContent(signal?: AbortSignal): Promise<HelpContent> {
  const response = await fetch(withBasePath(HELP_CONTENT_URL), {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return normalizeHelpContent(await response.json())
}

export async function loadHelpArticle(file: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(articlePath(file), {
    signal,
    cache: 'no-store',
    headers: { Accept: 'text/markdown, text/plain' },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

export async function saveHelpArticle(
  draft: HelpArticleDraft,
  expectedUpdatedAt: string,
): Promise<{ content: HelpContent; article: HelpArticle }> {
  const articleId = draft.id.trim()
  const title = draft.title.trim()
  if (!isValidHelpArticleId(articleId)) throw new Error('invalid article id')
  if (!title) throw new Error('article title is required')

  const current = await loadHelpContent()
  if (expectedUpdatedAt && current.updatedAt && current.updatedAt !== expectedUpdatedAt) {
    throw new HelpContentConflictError()
  }

  const file = helpArticleFile(articleId)
  const markdownResponse = await fetch(articlePath(file), {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', Accept: 'text/plain' },
    body: draft.content,
  })
  if (!markdownResponse.ok) throw new Error(`HTTP ${markdownResponse.status}`)

  const updatedAt = new Date().toISOString()
  const article: HelpArticle = {
    id: articleId,
    title,
    summary: draft.summary.trim(),
    file,
    builtin: current.articles.find((item) => item.id === articleId)?.builtin ?? false,
    updatedAt,
  }
  const articles = current.articles.some((item) => item.id === articleId)
    ? current.articles.map((item) => item.id === articleId ? article : item)
    : [...current.articles, article]
  const content: HelpContent = { version: 1, updatedAt, articles }
  await saveHelpIndex(content)
  return { content, article }
}

export async function deleteHelpArticle(id: string, expectedUpdatedAt: string): Promise<HelpContent> {
  const current = await loadHelpContent()
  if (expectedUpdatedAt && current.updatedAt && current.updatedAt !== expectedUpdatedAt) {
    throw new HelpContentConflictError()
  }
  const article = current.articles.find((item) => item.id === id)
  if (!article) return current

  const content: HelpContent = {
    version: 1,
    updatedAt: new Date().toISOString(),
    articles: current.articles.filter((item) => item.id !== id),
  }
  await saveHelpIndex(content)
  await fetch(articlePath(article.file), { method: 'DELETE' }).catch(() => undefined)
  return content
}

async function saveHelpIndex(content: HelpContent): Promise<void> {
  const response = await fetch(withBasePath(HELP_CONTENT_URL), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(content, null, 2),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}
