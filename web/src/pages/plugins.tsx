import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Puzzle } from 'lucide-react'
import type { DshPluginSort } from '@/api/dsh-plugins'
import { useAuth } from '@/features/auth/use-auth'
import { usePageHeader } from '@/features/pages/page-content'
import { DshPluginCard } from '@/features/plugin/plugin-card'
import { useDshPluginCategories, useDshPlugins } from '@/shared/hooks/use-dsh-plugin-queries'
import { EmptyState } from '@/shared/components/empty-state'
import { Pagination } from '@/shared/components/pagination'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

const PAGE_SIZE = 12

export function PluginsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const header = usePageHeader('plugins', t('plugin.listTitle'), t('plugin.listDescription'))
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<DshPluginSort>('newest')
  const [page, setPage] = useState(0)

  const { data, isLoading } = useDshPlugins({
    q: query || undefined,
    category: category || undefined,
    sort,
    page,
    size: PAGE_SIZE,
  })
  const { data: categories } = useDshPluginCategories()
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  return (
    <div className={APP_SHELL_PAGE_CLASS_NAME}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <Puzzle className="h-4 w-4" /> {t('plugin.listTitle')}
          </div>
          <h1 className="text-4xl font-bold font-heading">{header.title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{header.description}</p>
        </div>
        {isAuthenticated ? (
          <Button
            data-analytics-id="plugin.publish.open"
            onClick={() => navigate({ to: '/dashboard/plugins/publish' })}
          >
            {t('plugin.publishButton')}
          </Button>
        ) : null}
      </div>

      <form
        className="flex max-w-xl flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(queryInput.trim())
          setPage(0)
        }}
      >
        <Input
          value={queryInput}
          placeholder={t('plugin.searchPlaceholder')}
          onChange={(event) => setQueryInput(event.target.value)}
          aria-label={t('plugin.searchPlaceholder')}
        />
        <Button type="submit" variant="outline">{t('nav.search')}</Button>
        <Select value={sort} onValueChange={(value) => { setSort(value as DshPluginSort); setPage(0) }}>
          <SelectTrigger className="w-[170px]" aria-label={t('plugin.sortLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t('plugin.sortNewest')}</SelectItem>
            <SelectItem value="downloads">{t('plugin.sortDownloads')}</SelectItem>
            <SelectItem value="updated">{t('plugin.sortUpdated')}</SelectItem>
            <SelectItem value="name">{t('plugin.sortName')}</SelectItem>
          </SelectContent>
        </Select>
      </form>

      <section className="space-y-2" aria-labelledby="plugin-category-filter-title">
        <div id="plugin-category-filter-title" className="text-sm font-medium text-foreground">
          {t('plugin.categoryFilterTitle')}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={category === '' ? 'default' : 'outline'}
            onClick={() => { setCategory(''); setPage(0) }}
          >
            {t('plugin.allCategories')}
          </Button>
          {categories?.map((item) => (
            <Button
              key={item.name}
              type="button"
              size="sm"
              variant={category === item.name ? 'default' : 'outline'}
              onClick={() => {
                setCategory((current) => current === item.name ? '' : item.name)
                setPage(0)
              }}
            >
              {item.name} ({item.count})
            </Button>
          ))}
        </div>
      </section>

      {isLoading ? (
        <SkeletonList count={PAGE_SIZE} />
      ) : data?.items.length ? (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {data.items.map((plugin) => (
              <DshPluginCard
                key={plugin.id}
                plugin={plugin}
                onOpen={() => navigate({
                  to: '/plugins/$namespace/$slug',
                  params: { namespace: plugin.namespace, slug: plugin.slug },
                })}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState
          title={t('plugin.emptyTitle')}
          description={t('plugin.emptyDescription')}
        />
      )}
    </div>
  )
}
