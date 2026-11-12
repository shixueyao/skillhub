import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HomeContentConflictError,
  createPortalId,
  normalizeHomeContent,
  saveHomeContent,
} from './home-content'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('home content normalization', () => {
  it('migrates legacy cards into one AI apps section', () => {
    const content = normalizeHomeContent({
      enabled: true,
      cardsTitle: '团队应用',
      cards: [{
        title: '知识库',
        body: '团队知识检索',
        linkText: '打开',
        linkUrl: 'https://example.com/kb',
        icon: '📚',
        category: '知识',
        tags: ['RAG'],
      }],
    })

    expect(content.version).toBe(2)
    expect(content.sections).toHaveLength(1)
    expect(content.sections[0].title).toBe('团队应用')
    expect(content.sections[0].items[0]).toMatchObject({
      title: '知识库',
      linkUrl: 'https://example.com/kb',
      category: '知识',
      tags: ['RAG'],
    })
  })

  it('drops empty sections and normalizes unsupported layouts', () => {
    const content = normalizeHomeContent({
      sections: [
        { title: '', items: [] },
        { id: 'apps', title: 'AI 应用', layout: 'carousel', items: [{ title: '助手', linkUrl: '/search' }] },
      ],
    })

    expect(content.sections).toHaveLength(1)
    expect(content.sections[0].layout).toBe('grid')
    expect(content.sections[0].id).toBe('apps')
  })
})

describe('home content persistence', () => {
  it('rejects a save when another administrator published newer content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ updatedAt: '2026-01-01T00:00:00.000Z', sections: [] }),
    }))

    await expect(saveHomeContent(
      normalizeHomeContent({ sections: [] }),
      '2025-01-01T00:00:00.000Z',
    )).rejects.toBeInstanceOf(HomeContentConflictError)
  })

  it('writes a version 2 document with a fresh updatedAt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ updatedAt: '2026-01-01T00:00:00.000Z', sections: [] }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const saved = await saveHomeContent(
      normalizeHomeContent({ sections: [] }),
      '2026-01-01T00:00:00.000Z',
    )

    expect(saved.version).toBe(2)
    expect(saved.updatedAt).not.toBe('2026-01-01T00:00:00.000Z')
    const [url, init] = fetchMock.mock.calls[1]
    expect(String(url)).toContain('/site/content/home.json')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body)
    expect(body.version).toBe(2)
    expect(body.homeManagedByApp).toBe(true)
  })

  it('creates stable, prefixed ids', () => {
    expect(createPortalId('section')).toMatch(/^section-/)
  })
})
