import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpen, Pencil, Search, X } from 'lucide-react'
import { useAuth } from '@/features/auth/use-auth'
import { loadHelpArticle, loadHelpContent } from '@/features/help/help-content'
import { MarkdownRenderer } from '@/features/skill/markdown-renderer'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/utils'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

export function HelpPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.platformRoles?.includes('SUPER_ADMIN') ?? false
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['help', 'content'],
    queryFn: ({ signal }) => loadHelpContent(signal),
    retry: false,
    staleTime: 0,
  })

  const articleQueries = useQueries({
    queries: (data?.articles ?? []).map((article) => ({
      queryKey: ['help', 'article', article.file],
      queryFn: ({ signal }: { signal: AbortSignal }) => loadHelpArticle(article.file, signal),
      enabled: Boolean(article.file),
      retry: false,
      staleTime: 60_000,
    })),
  })

  const contentByFile = useMemo(() => {
    const map = new Map<string, string>()
    data?.articles.forEach((article, index) => {
      map.set(article.file, articleQueries[index]?.data ?? '')
    })
    return map
  }, [data, articleQueries])

  const filteredArticles = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return data?.articles ?? []
    return (data?.articles ?? []).filter((article) => {
      const haystack = [
        article.title,
        article.summary,
        contentByFile.get(article.file) ?? '',
      ].join('\n').toLowerCase()
      return haystack.includes(needle)
    })
  }, [contentByFile, data, query])

  useEffect(() => {
    if (!filteredArticles.length) return
    if (!filteredArticles.some((article) => article.id === selectedId)) {
      setSelectedId(filteredArticles[0].id)
    }
  }, [filteredArticles, selectedId])

  const activeArticle = filteredArticles.find((article) => article.id === selectedId) ?? filteredArticles[0]
  const activeIndex = activeArticle
    ? (data?.articles.findIndex((article) => article.id === activeArticle.id) ?? -1)
    : -1
  const activeQuery = activeIndex >= 0 ? articleQueries[activeIndex] : undefined

  if (isLoading) {
    return <div className={APP_SHELL_PAGE_CLASS_NAME}><SkeletonList count={4} /></div>
  }
  if (isError || !data) {
    return (
      <div className={`${APP_SHELL_PAGE_CLASS_NAME} space-y-3`}>
        <h1 className="text-3xl font-bold font-heading">{t('help.title')}</h1>
        <p className="text-sm text-destructive">{t('help.loadFailed')}</p>
      </div>
    )
  }

  return (
    <div className={`${APP_SHELL_PAGE_CLASS_NAME} space-y-6`}>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <BookOpen className="h-4 w-4" />
            {t('help.badge')}
          </div>
          <h1 className="text-4xl font-bold font-heading">{t('help.title')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('help.description')}</p>
        </div>
        {isAdmin ? (
          <Button onClick={() => void navigate({ to: '/dashboard/help' })}>
            <Pencil className="mr-1 h-4 w-4" />
            {t('help.manage')}
          </Button>
        ) : null}
      </header>

      {data.articles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 p-12 text-center text-sm text-muted-foreground">
          {t('help.empty')}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="h-fit rounded-xl border border-border/60 bg-card p-2">
            <div className="p-1 pb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  inputMode="search"
                  className="h-9 pl-9 pr-8"
                  value={query}
                  placeholder={t('help.searchPlaceholder')}
                  aria-label={t('help.searchPlaceholder')}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={t('help.clearSearch')}
                    onClick={() => setQuery('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              {query ? (
                <p className="mt-2 px-1 text-xs text-muted-foreground">
                  {t('help.searchResults', { count: filteredArticles.length })}
                </p>
              ) : null}
            </div>

            <nav aria-label={t('help.articles')} className="space-y-1">
              {filteredArticles.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => setSelectedId(article.id)}
                  className={cn(
                    'block w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                    article.id === activeArticle?.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <span className="block text-sm font-medium">{article.title}</span>
                  {article.summary ? <span className="mt-0.5 block text-xs text-muted-foreground">{article.summary}</span> : null}
                </button>
              ))}
            </nav>
            {query && filteredArticles.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('help.noResults')}</p>
            ) : null}
          </aside>

          <article className="min-w-0 rounded-xl border border-border/60 bg-card p-6 sm:p-8">
            {query && filteredArticles.length === 0 ? (
              <div className="py-16 text-center">
                <Search className="mx-auto h-8 w-8 text-muted-foreground" />
                <h2 className="mt-3 text-lg font-semibold">{t('help.noResults')}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t('help.noResultsDescription')}</p>
              </div>
            ) : null}
            {activeQuery?.isLoading ? <SkeletonList count={2} /> : null}
            {activeQuery?.isError ? <p className="text-sm text-destructive">{t('help.articleLoadFailed')}</p> : null}
            {activeQuery?.data ? <MarkdownRenderer content={activeQuery.data} /> : null}
          </article>
        </div>
      )}
    </div>
  )
}
