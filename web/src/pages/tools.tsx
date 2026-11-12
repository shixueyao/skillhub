import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, FileArchive, Plus, Search, Upload } from 'lucide-react'
import { listAiToolCategories, listAiTools, type AiToolQuery } from '@/api/ai-tools'
import { useAuth } from '@/features/auth/use-auth'
import { usePageHeader } from '@/features/pages/page-content'
import { formatBytes, toolInitial } from '@/features/tools/tool-utils'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/utils'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

const SORT_OPTIONS: Array<{ value: NonNullable<AiToolQuery['sort']>; labelKey: string }> = [
  { value: 'newest', labelKey: 'tools.sortNewest' },
  { value: 'downloads', labelKey: 'tools.sortDownloads' },
  { value: 'name', labelKey: 'tools.sortName' },
]

export function ToolsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const header = usePageHeader('tools', t('tools.title'), t('tools.description'))
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<NonNullable<AiToolQuery['sort']>>('newest')
  const [page, setPage] = useState(0)
  const isAdmin = user?.platformRoles?.includes('SUPER_ADMIN') ?? false

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ai-tools', query, category, sort, page],
    queryFn: ({ signal }) => listAiTools({ q: query, category, sort, page, size: 24 }, signal),
    retry: false,
  })
  const { data: categories } = useQuery({
    queryKey: ['ai-tools', 'categories'],
    queryFn: ({ signal }) => listAiToolCategories(signal),
    retry: false,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  return (
    <div className={`${APP_SHELL_PAGE_CLASS_NAME} space-y-8`}>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <FileArchive className="h-4 w-4" />
            {t('tools.badge')}
          </div>
          <h1 className="text-4xl font-bold font-heading">{header.title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{header.description}</p>
        </div>
        {isAdmin ? (
          <Button onClick={() => void navigate({ to: '/dashboard/tools/publish' })}>
            <Upload className="mr-1 h-4 w-4" />
            {t('tools.upload')}
          </Button>
        ) : null}
      </header>

      <section className="space-y-4 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t('tools.searchPlaceholder')}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(0) }}
            />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as NonNullable<AiToolQuery['sort']>)
              setPage(0)
            }}
            aria-label={t('tools.sort')}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              category === '' ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 hover:bg-accent',
            )}
            onClick={() => { setCategory(''); setPage(0) }}
          >
            {t('tools.allCategories')}
          </button>
          {categories?.map((item) => (
            <button
              key={item.category}
              type="button"
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                category === item.category ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 hover:bg-accent',
              )}
              onClick={() => {
                setCategory((current) => current === item.category ? '' : item.category)
                setPage(0)
              }}
            >
              {item.category}
              <span className="ml-1 text-[11px] opacity-70">{item.count}</span>
            </button>
          ))}
        </div>
      </section>

      {isLoading ? <SkeletonList count={6} /> : null}
      {isError ? <p className="text-sm text-destructive">{t('tools.loadFailed')}</p> : null}

      {!isLoading && !isError && data?.items.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border/70 p-12 text-center">
          <FileArchive className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">{t('tools.emptyTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('tools.emptyDescription')}</p>
          {isAdmin ? (
            <Button className="mt-4" onClick={() => void navigate({ to: '/dashboard/tools/publish' })}>
              <Plus className="mr-1 h-4 w-4" />
              {t('tools.upload')}
            </Button>
          ) : null}
        </section>
      ) : null}

      {data?.items.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((tool) => (
              <Link
                key={tool.id}
                to="/tools/$toolId"
                params={{ toolId: String(tool.id) }}
                className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-primary/30 hover:bg-accent/30"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg font-semibold text-primary">
                    {toolInitial(tool.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold">{tool.name}</h2>
                      {tool.version ? <span className="rounded bg-secondary/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">{tool.version}</span> : null}
                    </div>
                    {tool.category ? <p className="mt-0.5 text-xs text-muted-foreground">{tool.category}</p> : null}
                  </div>
                </div>
                <p className="line-clamp-3 min-h-[3.75rem] text-sm leading-6 text-muted-foreground">{tool.summary || t('tools.noSummary')}</p>
                <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" />{tool.downloadCount}</span>
                  <span>{formatBytes(tool.sizeBytes)}</span>
                </div>
              </Link>
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                {t('tools.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>
                {t('tools.next')}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
