import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Package, Puzzle } from 'lucide-react'
import { LandingPage } from '@/pages/landing'
import { loadHomeContent } from '@/features/portal/home-content'
import { PortalItemCard } from '@/features/portal/portal-item-card'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { withBasePath } from '@/shared/lib/base-path'
import { cn } from '@/shared/lib/utils'
import { APP_FRAME_CLASS_NAME } from '@/shared/lib/layout-frame'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

export function PortalHomePage() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['portal-home', 'content'],
    queryFn: ({ signal }) => loadHomeContent(signal),
    retry: false,
    staleTime: 0,
  })

  if (isLoading) {
    return (
      <div className={`${APP_FRAME_CLASS_NAME} ${APP_SHELL_PAGE_CLASS_NAME}`}>
        <SkeletonList count={4} />
      </div>
    )
  }
  if (isError || !data || !data.enabled) {
    return <LandingPage />
  }

  const hero = data.hero
  const title = hero.title || t('portal.title')
  const description = hero.description || t('portal.description')
  const buttonText = hero.primaryButtonText || t('portal.enter')
  const buttonUrl = hero.primaryButtonUrl || '/search'
  const featuredItems = data.sections
    .flatMap((section) => section.items)
    .filter((item) => item.showOnHome)

  return (
    <div
      data-portal-home="true"
      className={`${APP_FRAME_CLASS_NAME} ${APP_SHELL_PAGE_CLASS_NAME} space-y-10 pb-12`}
    >
      {data.notice.enabled && data.notice.text ? (
        <div
          role="status"
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            data.notice.level === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
            data.notice.level === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
            data.notice.level === 'danger' && 'border-destructive/30 bg-destructive/10 text-destructive',
            data.notice.level === 'info' && 'border-primary/20 bg-primary/5 text-foreground',
          )}
        >
          {data.notice.text}
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-background to-background p-8 sm:p-12">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Package className="h-3.5 w-3.5" />
            {t('portal.badge')}
          </div>
          <h1 className="text-4xl font-bold font-heading tracking-tight sm:text-5xl">{title}</h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{description}</p>
          <div className="flex flex-wrap gap-3">
            <a
              data-analytics-id="portal.primary.open"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              href={withBasePath(buttonUrl)}
            >
              {buttonText}
              <ArrowRight className="h-4 w-4" />
            </a>
            {data.hero.primaryButtonUrl ? null : (
              <Link
                to="/plugins"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-border/60 bg-background px-6 text-sm font-semibold transition-colors hover:bg-accent"
              >
                <Puzzle className="h-4 w-4" />
                {t('plugin.nav')}
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold font-heading">{t('apps.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('portal.appsDescription')}</p>
          </div>
          <Link
            to="/apps"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-background px-4 text-sm font-semibold transition-colors hover:bg-accent"
          >
            {t('apps.browseMore')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {featuredItems.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredItems.map((item) => (
              <PortalItemCard
                key={`${item.title}-${item.linkUrl}-${item.category}`}
                item={item}
                layout="grid"
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 p-8 text-center">
            <p className="text-sm text-muted-foreground">{t('apps.emptyDescription')}</p>
            <Link
              to="/apps"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              {t('apps.browse')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
