import { describe, expect, it } from 'vitest'
import { normalizePageContent } from './page-content'

describe('page content', () => {
  it('keeps overrides and fills missing managed pages with empty headers', () => {
    const content = normalizePageContent({
      updatedAt: '2026-01-01T00:00:00Z',
      siteName: '  Team Hub  ',
      tabLabels: { apps: '应用中心', skills: '  ' },
      pages: {
        apps: { title: 'AI 应用中心', description: '自定义描述' },
        tools: { title: '  ', description: '工具描述' },
      },
    })

    expect(content.updatedAt).toBe('2026-01-01T00:00:00Z')
    expect(content.siteName).toBe('Team Hub')
    expect(content.tabLabels.apps).toBe('应用中心')
    expect(content.tabLabels.skills).toBe('')
    expect(content.tabLabels.help).toBe('')
    expect(content.pages.apps).toEqual({ title: 'AI 应用中心', description: '自定义描述' })
    expect(content.pages.tools).toEqual({ title: '', description: '工具描述' })
    expect(content.pages.plugins).toEqual({ title: '', description: '' })
  })
})
