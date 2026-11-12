import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/use-auth'
import { useSiteName, useTabLabels } from '@/features/site/site-name'
import { LanguageSwitcher } from '@/shared/components/language-switcher'
import { ThemeToggle } from '@/shared/components/theme-toggle'
import { UserMenu } from '@/shared/components/user-menu'
import { NotificationBell } from '@/features/notification/notification-bell'
import { dismissOpenOverlays } from '@/shared/lib/dismiss-open-overlays'
import { syncDocumentLanguage } from '@/shared/lib/document-language'
import { DashboardSidebar, SIDEBAR_GROUPS } from '@/pages/dashboard'
import { canViewGovernanceCenter } from '@/shared/lib/governance-access'
import { APP_HEADER_CONTENT_CLASS_NAME, getAppHeaderClassName } from './layout-header-style'
import { APP_FRAME_CLASS_NAME } from '@/shared/lib/layout-frame'
import { AUTH_ENTRY_PATHS, SPLIT_AUTH_PATHS, getAppMainContentLayout, resolveAppMainContentPathname } from './layout-main-content'

/**
 * Application shell shared by all routed pages.
 *
 * It owns the global header, feature tabs, language switcher, auth-aware navigation, and
 * suspense fallback used while lazy route modules are loading.
 */
export function Layout() {
  const { t, i18n } = useTranslation()
  const siteName = useSiteName()
  const tabLabels = useTabLabels()
  const { pathname, resolvedPathname } = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      resolvedPathname: s.resolvedLocation?.pathname,
    }),
  })
  const { user, isLoading } = useAuth()
  const [isHeaderElevated, setIsHeaderElevated] = useState(false)
  const previousPathnameRef = useRef(pathname)
  const contentLayoutPathname = resolveAppMainContentPathname(pathname, resolvedPathname)
  const mainContentLayout = getAppMainContentLayout(contentLayoutPathname)
  const isAuthEntryRoute = AUTH_ENTRY_PATHS.includes(contentLayoutPathname as typeof AUTH_ENTRY_PATHS[number])
  const isSplitAuthRoute = SPLIT_AUTH_PATHS.includes(contentLayoutPathname as typeof SPLIT_AUTH_PATHS[number])
  const showSidebar = mainContentLayout.sidebarRowClassName !== undefined
  const governanceVisible = canViewGovernanceCenter(user?.platformRoles)
  const filteredDashboardGroups = SIDEBAR_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (
        (!item.admin || governanceVisible)
        && (!item.superAdmin || user?.platformRoles?.includes('SUPER_ADMIN'))
        && (!item.passwordCapability || user?.canChangePassword === true)
      )),
    }))
    .filter((group) => group.items.length > 0)

  useEffect(() => {
    syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language)
  }, [i18n.language, i18n.resolvedLanguage])

  useEffect(() => {
    const updateHeaderElevation = () => {
      setIsHeaderElevated(window.scrollY > 0)
    }

    updateHeaderElevation()
    window.addEventListener('scroll', updateHeaderElevation, { passive: true })

    return () => {
      window.removeEventListener('scroll', updateHeaderElevation)
    }
  }, [])

  // Pathname-only: search debounce on /search must not dismiss overlays mid-typing.
  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return
    }
    previousPathnameRef.current = pathname
    dismissOpenOverlays()
  }, [pathname])

  const navItems: Array<{
    key: keyof typeof tabLabels
    label: string
    to: string
    analyticsId?: string
    exact?: boolean
    auth?: boolean
    adminOnly?: boolean
  }> = [
    { key: 'home', label: tabLabels.home || t('nav.landing'), to: '/', analyticsId: 'navigation.home.open', exact: true },
    { key: 'apps', label: tabLabels.apps || t('apps.nav'), to: '/apps', analyticsId: 'navigation.apps.open' },
    { key: 'tools', label: tabLabels.tools || t('tools.nav'), to: '/tools', analyticsId: 'navigation.tools.open' },
    { key: 'mcp', label: tabLabels.mcp || t('mcp.nav'), to: '/mcp', analyticsId: 'navigation.mcp.open' },
    { key: 'skills', label: tabLabels.skills || t('nav.marketplace'), to: '/search', analyticsId: 'navigation.skills.open' },
    { key: 'suites', label: tabLabels.suites || t('nav.suites'), to: '/suites', analyticsId: 'navigation.suites.open' },
    { key: 'plugins', label: tabLabels.plugins || t('plugin.nav'), to: '/plugins', analyticsId: 'navigation.plugins.open' },
    { key: 'publish', label: tabLabels.publish || t('nav.publish'), to: '/dashboard/publish', analyticsId: 'skill.publish.open', auth: true },
    { key: 'mySkills', label: tabLabels.mySkills || t('sidebar.mySkills'), to: '/dashboard/skills', analyticsId: 'navigation.owned.skills', auth: true },
    { key: 'mySuites', label: tabLabels.mySuites || t('sidebar.mySuites'), to: '/dashboard/suites', analyticsId: 'navigation.owned.suites', auth: true },
    { key: 'myPlugins', label: tabLabels.myPlugins || t('sidebar.myPlugins'), to: '/dashboard/plugins', analyticsId: 'navigation.owned.plugins', auth: true },
    { key: 'namespaces', label: tabLabels.namespaces || t('sidebar.namespaces'), to: '/dashboard/namespaces', analyticsId: 'namespace.list.open', auth: true },
    { key: 'dashboard', label: tabLabels.dashboard || t('nav.dashboard'), to: '/dashboard', analyticsId: 'navigation.dashboard.open', auth: true },
    { key: 'help', label: tabLabels.help || t('help.nav'), to: '/help', analyticsId: 'navigation.help.open' },
  ]

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return pathname === to
    // 「控制台」按钮：仅在 /dashboard 主页或 /settings/* 时高亮
    if (to === '/dashboard') {
      return pathname === '/dashboard' || pathname.startsWith('/settings/')
    }
    // Keep matching strict so parent dashboard paths do not highlight unrelated child links.
    return pathname === to
  }
  const isSuperAdmin = user?.platformRoles?.includes('SUPER_ADMIN') ?? false
  const visibleNavItems = navItems.filter((item) => (
    (!item.auth || !!user) && (!item.adminOnly || isSuperAdmin)
  ))

  return (
    <div className="min-h-screen flex flex-col relative" style={{ background: 'var(--bg-page, hsl(var(--background)))' }}>
      {/* Clip only the decorative layer so in-tree Select/Dropdown are not cropped. */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-x-clip" aria-hidden>
        <div
          className="absolute top-0 right-0 w-[600px] h-[500px] rounded-full opacity-90"
          style={{
            background: 'radial-gradient(ellipse at 70% 20%, hsl(var(--glow-accent) / 0.12) 0%, hsl(var(--glow-primary) / 0.07) 40%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      {/* Header */}
      <header
        className={isSplitAuthRoute ? 'absolute right-5 top-4 z-50 flex items-center sm:right-10' : getAppHeaderClassName(isHeaderElevated)}
        style={isSplitAuthRoute ? undefined : { borderColor: 'hsl(var(--border))' }}
      >
        <div className={isSplitAuthRoute ? 'flex items-center' : APP_HEADER_CONTENT_CLASS_NAME}>
        {!isSplitAuthRoute ? (
          <Link data-analytics-id="navigation.home.open" to="/" className="text-xl font-semibold tracking-tight flex-shrink-0" style={{ color: 'hsl(var(--foreground))' }}>
            {siteName}
          </Link>
        ) : null}

        {!isAuthEntryRoute ? (
          <nav
            aria-label={t('layout.primaryNavigation')}
            className="mx-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto xl:flex"
          >
            {visibleNavItems.map((item) => {
              const active = isActive(item.to, item.exact)
              return (
                <Link
                  data-analytics-id={item.analyticsId}
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`shrink-0 whitespace-nowrap border-b-2 px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        ) : null}

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0" style={{ color: 'hsl(var(--text-secondary))' }}>
          <ThemeToggle />
          <LanguageSwitcher />
          {user && <NotificationBell />}
          {isLoading ? null : user ? (
            <UserMenu user={user} />
          ) : !isAuthEntryRoute ? (
            <Link data-analytics-id="auth.login.open"
              to="/login"
              className="hover:opacity-80 transition-opacity"
            >
              {t('nav.login')}
            </Link>
          ) : null}
        </div>
        </div>
      </header>

      {/* Main content */}
      <main className={mainContentLayout.mainClassName}>
        <Suspense
          fallback={
            <div className={`${APP_FRAME_CLASS_NAME} space-y-3 py-8 animate-fade-up`}>
              <div className="h-8 w-36 animate-shimmer rounded-md" />
              <div className="h-4 w-56 animate-shimmer rounded-md" />
              <div className="h-48 animate-shimmer rounded-lg" />
            </div>
          }
        >
          <div className={mainContentLayout.contentClassName}>
          {showSidebar ? (
            <div className={mainContentLayout.sidebarRowClassName ?? "flex flex-col lg:flex-row gap-6"}>
              <DashboardSidebar groups={filteredDashboardGroups} user={user} t={t} pathname={contentLayoutPathname} />
              <div className={mainContentLayout.sidebarContentClassName ?? "flex-1 min-w-0"}>
                <Outlet />
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
        </Suspense>
      </main>

    </div>
  )
}
