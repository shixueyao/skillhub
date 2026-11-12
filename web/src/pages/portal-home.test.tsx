/** @vitest-environment jsdom */

import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortalHomePage } from './portal-home'

const content = vi.hoisted(() => ({
  version: 2,
  updatedAt: '2026-01-01T00:00:00Z',
  enabled: true,
  homeManagedByApp: true,
  notice: { enabled: true, level: 'info', text: '周五维护' },
  hero: { title: '团队 AI 工作台', description: '统一入口', primaryButtonText: '进入', primaryButtonUrl: '/search' },
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
  footerNote: '内部使用',
  nav: {},
}))

vi.mock('@/features/portal/home-content', () => ({
  loadHomeContent: vi.fn().mockResolvedValue(content),
}))
vi.mock('@/pages/landing', () => ({ LandingPage: () => <div>landing-fallback</div> }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
}))
vi.mock('react-i18next', async () => ({
  ...await vi.importActual<typeof import('react-i18next')>('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
}))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PortalHomePage />
    </QueryClientProvider>,
  )
}

describe('PortalHomePage', () => {
  afterEach(cleanup)

  it('renders the published notice and hero without inlining AI application cards', async () => {
    renderPage()

    expect(await screen.findByText('团队 AI 工作台')).toBeTruthy()
    expect(screen.getByText('周五维护')).toBeTruthy()
    expect(screen.getByText('apps.title')).toBeTruthy()
    expect(screen.queryByText('知识库助手')).toBeNull()
  })
})
