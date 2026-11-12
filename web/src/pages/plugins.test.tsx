/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginsPage } from './plugins'

const mocks = vi.hoisted(() => ({
  search: vi.fn((_query?: unknown) => ({
    data: { items: [], total: 0, page: 0, size: 12 },
    isLoading: false,
  })),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/features/auth/use-auth', () => ({ useAuth: () => ({ isAuthenticated: false }) }))
vi.mock('@/shared/hooks/use-dsh-plugin-queries', () => ({
  useDshPlugins: (query: unknown) => mocks.search(query),
  useDshPluginCategories: () => ({
    data: [{ name: 'Official', count: 3 }],
  }),
}))
vi.mock('@/features/plugin/plugin-card', () => ({ DshPluginCard: () => null }))
vi.mock('@/features/pages/page-content', () => ({
  usePageHeader: (_key: string, title: string, description: string) => ({ title, description }),
}))

describe('PluginsPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps typed keywords local until explicit submission', () => {
    render(<PluginsPage />)
    const input = screen.getByPlaceholderText('plugin.searchPlaceholder')

    fireEvent.change(input, { target: { value: ' skillhub ' } })
    expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({ q: undefined, page: 0 }))

    fireEvent.click(screen.getByRole('button', { name: 'nav.search' }))
    expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'skillhub', page: 0 }))
  })

  it('filters by category and resets to the first page', () => {
    render(<PluginsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Official (3)' }))

    expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({
      category: 'Official',
      page: 0,
    }))

    fireEvent.click(screen.getByRole('button', { name: 'plugin.allCategories' }))
    expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({ category: undefined }))
  })

  it('shows the empty state when no plugin matches', () => {
    render(<PluginsPage />)
    expect(screen.getByText('plugin.emptyTitle')).toBeTruthy()
  })
})
