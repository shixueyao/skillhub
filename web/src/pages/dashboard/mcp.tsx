import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Blocks, Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteMcpServer, listMyMcpServers } from '@/api/mcp-servers'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { toast } from '@/shared/lib/toast'
import { Button } from '@/shared/ui/button'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

export function MyMcpPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mcp-servers', 'mine', page],
    queryFn: ({ signal }) => listMyMcpServers(page, 24, signal),
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMcpServer(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      toast.success(t('mcp.deleted'))
    },
    onError: (error) => toast.error(t('mcp.deleteFailed'), error instanceof Error ? error.message : ''),
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  return (
    <div className={`${APP_SHELL_PAGE_CLASS_NAME} space-y-6`}>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <Blocks className="h-4 w-4" />
            {t('mcp.myMcp')}
          </div>
          <h1 className="text-3xl font-bold font-heading">{t('mcp.myMcp')}</h1>
          <p className="mt-2 text-muted-foreground">{t('mcp.myMcpDescription')}</p>
        </div>
        <Button onClick={() => void navigate({ to: '/dashboard/mcp/publish' })}>
          <Plus className="mr-1 h-4 w-4" />
          {t('mcp.publish')}
        </Button>
      </header>

      {isLoading ? <SkeletonList count={5} /> : null}
      {isError ? <p className="text-sm text-destructive">{t('mcp.loadFailed')}</p> : null}

      {!isLoading && !isError && data?.items.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border/70 p-12 text-center">
          <Blocks className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">{t('mcp.myMcpEmpty')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('mcp.myMcpEmptyDescription')}</p>
          <Button className="mt-4" onClick={() => void navigate({ to: '/dashboard/mcp/publish' })}>
            <Plus className="mr-1 h-4 w-4" />
            {t('mcp.publish')}
          </Button>
        </section>
      ) : null}

      {data?.items.length ? (
        <div className="space-y-3">
          {data.items.map((server) => (
            <div key={server.id} className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Blocks className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <Link to="/mcp/$slug" params={{ slug: server.slug }} className="truncate font-semibold hover:underline">
                    {server.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{server.transport.replace('_', ' ')}</span>
                    <span>·</span>
                    <span>{server.packageType}</span>
                    {server.hasAttachment ? <span>· {t('mcp.hasAttachment')}</span> : null}
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{server.summary || t('mcp.noSummary')}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => void navigate({ to: '/mcp/$slug', params: { slug: server.slug } })}>
                  {t('mcp.view')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void navigate({ to: '/dashboard/mcp/$slug/edit', params: { slug: server.slug } })}>
                  <Pencil className="mr-1 h-4 w-4" />
                  {t('mcp.edit')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(t('mcp.deleteConfirm'))) deleteMutation.mutate(server.id)
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  {t('mcp.delete')}
                </Button>
              </div>
            </div>
          ))}
          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                {t('mcp.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>
                {t('mcp.next')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
