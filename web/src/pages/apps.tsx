import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Plus, Sparkles } from 'lucide-react'
import { loadHomeContent } from '@/features/portal/home-content'
import { PortalItemCard } from '@/features/portal/portal-item-card'
import { useAuth } from '@/features/auth/use-auth'
import { usePageHeader } from '@/features/pages/page-content'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

export function AppsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const header = usePageHeader('apps', t('apps.title'), t('apps.description'))
  const { user } = useAuth()
  const [category, setCategory] = useState('')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['portal-home', 'content'],
    queryFn: ({ signal }) => loadHomeContent(signal),
    retry: false,
    staleTime: 0,
  })
  const isAdmin = user?.platformRoles?.includes('SUPER_ADMIN') ?? false

  const categories = useMemo(() => {
    const values = new Set<string>()
    data?.sections.forEach((section) => section.items.forEach((item) => {
      if (item.category) values.add(item.category)
    }))
    return [...values].sort((left, right) => left.localeCompare(right))
  }, [data])

  if (isLoading) {
    return <div className={APP_SHELL_PAGE_CLASS_NAME}><SkeletonList count={4} /></div>
  }
  if (isError || !data) {
    return (
      <div className={APP_SHELL_PAGE_CLASS_NAME}>
        <p className="text-sm text-destructive">{t('apps.loadFailed')}</p>
      </div>
    )
  }

  const hasItems = data.sections.some((section) => section.items.length > 0)

  return (
    <div className={`${APP_SHELL_PAGE_CLASS_NAME} space-y-8`}>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            {t('apps.badge')}
          </div>
          <h1 className="text-4xl font-bold font-heading">{header.title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{header.description}</p>
        </div>
        {isAdmin ? (
          <Button onClick={() => void navigate({ to: '/dashboard/apps' })}>
            <Plus className="mr-1 h-4 w-4" />
            {t('apps.manage')}
          </Button>
        ) : null}
      </header>

      {categories.length > 0 ? (
        <section className="space-y-2" aria-labelledby="apps-categories-title">
          <h2 id="apps-categories-title" className="text-sm font-medium text-muted-foreground">
            {t('portal.categories')}
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                category === '' ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 hover:bg-accent',
              )}
              onClick={() => setCategory('')}
            >
              {t('portal.allCategories')}
            </button>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  category === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 hover:bg-accent',
                )}
                onClick={() => setCategory((current) => current === item ? '' : item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {!hasItems ? (
        <section className="rounded-xl border border-dashed border-border/70 p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">{t('apps.emptyTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('apps.emptyDescription')}</p>
          {isAdmin ? (
            <Button className="mt-4" onClick={() => void navigate({ to: '/dashboard/apps' })}>
              {t('apps.manage')}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : null}
        </section>
      ) : data.sections.map((section) => {
        const items = section.items.filter((item) => !category || item.category === category)
        if (items.length === 0) return null
        const showSectionTitle = section.title && section.title !== t('apps.title')
        return (
          <section key={section.id} className="space-y-4" aria-labelledby={showSectionTitle ? `apps-section-${section.id}` : undefined}>
            {showSectionTitle || section.description ? (
              <div>
                {showSectionTitle ? (
                  <h2 id={`apps-section-${section.id}`} className="text-2xl font-bold font-heading">{section.title}</h2>
                ) : null}
                {section.description ? <p className="mt-1 text-muted-foreground">{section.description}</p> : null}
              </div>
            ) : null}
            <div className={cn(
              section.layout === 'list'
                ? 'divide-y divide-border/50 rounded-xl border border-border/60 bg-card'
                : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
            )}>
              {items.map((item) => (
                <PortalItemCard key={`${section.id}-${item.title}-${item.linkUrl}`} item={item} layout={section.layout} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
