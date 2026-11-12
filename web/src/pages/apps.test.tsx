/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppsPage } from './apps'

const content = vi.hoisted(() => ({
  version: 2,
  updatedAt: '2026-01-01T00:00:00Z',
  enabled: true,
  homeManagedByApp: true,
  notice: { enabled: false, level: 'info', text: '' },
  hero: { title: '团队 AI 工作台', description: '', primaryButtonText: '', primaryButtonUrl: '' },
  sections: [{
    id: 'apps',
    title: 'AI 应用',
    description: '常用能力',
    layout: 'grid' as const,
    items: [{
      title: '知识库助手',
      body: '检索团队知识',
      linkText: '打开',
      linkUrl: 'https://example.com/kb',
      icon: '📚',
      category: '知识',
      tags: ['RAG'],
    }],
  }],
  footerNote: '',
  nav: {},
}))

vi.mock('@/features/portal/home-content', () => ({
  loadHomeContent: vi.fn().mockResolvedValue(content),
}))
vi.mock('@/features/auth/use-auth', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('react-i18next', async () => ({
  ...await vi.importActual<typeof import('react-i18next')>('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
}))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppsPage />
    </QueryClientProvider>,
  )
}

describe('AppsPage', () => {
  afterEach(cleanup)

  it('renders published AI application sections and cards', async () => {
    renderPage()

    expect(await screen.findByText('apps.title')).toBeTruthy()
    expect(screen.getAllByText('AI 应用').length).toBeGreaterThan(0)
    expect(screen.getByText('知识库助手')).toBeTruthy()
    expect(screen.getByText('RAG')).toBeTruthy()
    expect(screen.getByRole('link', { name: /知识库助手/ }).getAttribute('href')).toBe('https://example.com/kb')
    expect(screen.queryByText('apps.manage')).toBeNull()
  })
})
