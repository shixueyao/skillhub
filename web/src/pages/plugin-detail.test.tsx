/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginDetailPage } from './plugin-detail'

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ namespace: 'acme', slug: 'hello-dsh' }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))
vi.mock('@/shared/hooks/use-dsh-plugin-queries', () => ({
  useDshPluginDetail: () => mocks.detail(),
  useUpdateDshPlugin: () => ({ mutate: vi.fn(), isPending: false }),
  useYankDshPluginVersion: () => ({ mutate: vi.fn(), isPending: false }),
  useUnyankDshPluginVersion: () => ({ mutate: vi.fn(), isPending: false }),
  useRecommendDshPluginVersion: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteDshPluginVersion: () => ({ mutate: vi.fn(), isPending: false }),
  useSetDshPluginHidden: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/shared/lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
  useCopyToClipboard: () => [false, vi.fn()],
}))
vi.mock('@/shared/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const plugin = {
  id: 7,
  namespaceId: 1,
  namespace: 'acme',
  namespaceDisplayName: 'Acme',
  slug: 'hello-dsh',
  packageName: '@acme/hello-dsh',
  displayName: 'Hello DSH',
  summary: 'Hello plugin',
  description: 'Long description',
  homepage: 'https://example.com',
  license: 'Apache-2.0',
  category: 'Official',
  tags: ['official'],
  status: 'ACTIVE',
  hidden: false,
  latestVersionId: 3,
  latestVersion: '1.2.3',
  downloadCount: 5,
  createdBy: 'user-1',
  createdByName: 'Tester',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  allowedActions: ['UPDATE_METADATA', 'HIDE', 'PUBLISH_VERSION'],
  versions: [{
    id: 3,
    version: '1.2.3',
    status: 'PUBLISHED',
    sha256: 'a'.repeat(64),
    sizeBytes: 1024,
    capabilities: ['bundle'],
    engines: { node: '>=24' },
    peerDependencies: {},
    compatNote: null,
    releaseNotes: null,
    downloadCount: 5,
    publishedAt: '2026-01-01T00:00:00Z',
    publishedBy: 'user-1',
    yankedAt: null,
    yankedBy: null,
    yankReason: null,
    recommended: true,
  }],
}

describe('PluginDetailPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the install command and manager actions for a publisher', () => {
    mocks.detail.mockReturnValue({ data: plugin, isLoading: false, error: null })

    render(<PluginDetailPage />)

    expect(screen.getByText('Hello DSH')).toBeTruthy()
    expect(screen.getByText(/dsh plugin --profile web add/)).toBeTruthy()
    expect(screen.getByText('plugin.detail.newVersionAction')).toBeTruthy()
    expect(screen.getByText('plugin.detail.editAction')).toBeTruthy()
    expect(screen.getByText('plugin.detail.hideAction')).toBeTruthy()
  })

  it('hides manager actions for an anonymous viewer', () => {
    mocks.detail.mockReturnValue({
      data: { ...plugin, allowedActions: [] },
      isLoading: false,
      error: null,
    })

    render(<PluginDetailPage />)

    expect(screen.queryByText('plugin.detail.editAction')).toBeNull()
    expect(screen.queryByText('plugin.detail.hideAction')).toBeNull()
  })
})
