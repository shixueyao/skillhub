import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { emptyTabLabels, loadPageContent, type TabLabels } from '@/features/pages/page-content'

export const DEFAULT_SITE_NAME = 'SkillHub'

interface SiteSettings {
  siteName: string
  tabLabels: TabLabels
}

const defaultSettings: SiteSettings = {
  siteName: DEFAULT_SITE_NAME,
  tabLabels: emptyTabLabels(),
}

const SiteSettingsContext = createContext<SiteSettings>(defaultSettings)

/**
 * Resolves the front-end-only site name and navigation tab labels from the
 * admin-managed pages document. The provider lives inside QueryClientProvider
 * and outside the router, so public pages and tests without a provider keep
 * the built-in defaults.
 */
export function SiteNameProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ['page-content', 'content'],
    queryFn: ({ signal }) => loadPageContent(signal),
    retry: false,
    staleTime: 0,
    meta: { skipGlobalErrorHandler: true },
  })
  const siteName = data?.siteName?.trim() || DEFAULT_SITE_NAME
  const tabLabels = data?.tabLabels ?? defaultSettings.tabLabels

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = siteName
    }
  }, [siteName])

  return (
    <SiteSettingsContext.Provider value={{ siteName, tabLabels }}>
      {children}
    </SiteSettingsContext.Provider>
  )
}

export function useSiteName(): string {
  return useContext(SiteSettingsContext).siteName
}

export function useTabLabels(): TabLabels {
  return useContext(SiteSettingsContext).tabLabels
}
