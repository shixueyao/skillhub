import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { DshPluginCard } from '@/features/plugin/plugin-card'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { EmptyState } from '@/shared/components/empty-state'
import { Pagination } from '@/shared/components/pagination'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { useMyDshPlugins } from '@/shared/hooks/use-dsh-plugin-queries'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const PAGE_SIZE = 12

export function MyPluginsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const { data, isLoading } = useMyDshPlugins(page, query)
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title={t('plugin.mine.title')}
        subtitle={t('plugin.mine.description')}
        actions={(
          <Button size="sm" onClick={() => navigate({ to: '/dashboard/plugins/publish' })}>
            <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
            {t('plugin.mine.publish')}
          </Button>
        )}
      />

      <form
        className="flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(queryInput.trim())
          setPage(0)
        }}
      >
        <Input
          type="search"
          value={queryInput}
          placeholder={t('plugin.searchPlaceholder')}
          aria-label={t('plugin.searchPlaceholder')}
          onChange={(event) => setQueryInput(event.target.value)}
        />
        <Button type="submit" variant="outline">{t('nav.search')}</Button>
      </form>

      {isLoading ? (
        <SkeletonList count={PAGE_SIZE} />
      ) : data?.items.length ? (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
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
          title={t('plugin.mine.empty')}
          description={t('plugin.mine.emptyDescription')}
        />
      )}
    </div>
  )
}
