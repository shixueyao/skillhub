import { describe, expect, it } from 'vitest'
import {
  helpArticleFile,
  isValidHelpArticleId,
  normalizeHelpContent,
} from './help-content'

describe('help content', () => {
  it('normalizes articles and drops duplicate or invalid ids', () => {
    const content = normalizeHelpContent({
      articles: [
        { id: 'skills', title: 'Skill 使用方法', file: 'help/skills.md', builtin: true },
        { id: 'skills', title: 'Duplicate' },
        { id: 'Bad ID', title: 'Invalid' },
        { id: 'custom', title: 'Custom' },
      ],
    })

    expect(content.articles).toHaveLength(2)
    expect(content.articles[0]).toMatchObject({ id: 'skills', builtin: true })
    expect(content.articles[1].file).toBe('help/custom.md')
  })

  it('validates article ids and derives the markdown path', () => {
    expect(isValidHelpArticleId('getting-started')).toBe(true)
    expect(isValidHelpArticleId('Bad ID')).toBe(false)
    expect(helpArticleFile('getting-started')).toBe('help/getting-started.md')
  })
})
