import { useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Blocks, Check, Copy, Download, Globe, Paperclip, Pencil, Server, Terminal, Trash2 } from 'lucide-react'
import { deleteMcpServer, getMcpServer, mcpAttachmentUrl } from '@/api/mcp-servers'
import { formatBytes } from '@/features/tools/tool-utils'
import { useAuth } from '@/features/auth/use-auth'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { toast } from '@/shared/lib/toast'
import { Button } from '@/shared/ui/button'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

export function McpDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { slug } = useParams({ strict: false }) as { slug: string }
  const [copied, setCopied] = useState(false)
  const { data: server, isLoading, isError } = useQuery({
    queryKey: ['mcp-servers', 'detail', slug],
    queryFn: ({ signal }) => getMcpServer(slug, signal),
    enabled: Boolean(slug),
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteMcpServer(server!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      toast.success(t('mcp.deleted'))
      await navigate({ to: '/mcp' })
    },
    onError: (error) => toast.error(t('mcp.deleteFailed'), error instanceof Error ? error.message : ''),
  })

  if (isLoading) {
    return <div className={APP_SHELL_PAGE_CLASS_NAME}><SkeletonList count={3} /></div>
  }
  if (isError || !server) {
    return (
      <div className={`${APP_SHELL_PAGE_CLASS_NAME} space-y-4`}>
        <p className="text-sm text-destructive">{t('mcp.notFound')}</p>
        <Button variant="outline" onClick={() => void navigate({ to: '/mcp' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('mcp.back')}
        </Button>
      </div>
    )
  }

  const canManage = Boolean(user && (user.userId === server.authorId || user.platformRoles?.includes('SUPER_ADMIN')))
  const configText = JSON.stringify(server.clientConfig, null, 2)
  const isRemote = server.transport !== 'STDIO'

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(configText)
      setCopied(true)
      toast.success(t('mcp.copied'))
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t('mcp.copyFailed'))
    }
  }

  return (
    <div className={`${APP_SHELL_PAGE_CLASS_NAME} space-y-8`}>
      <Link to="/mcp" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t('mcp.back')}
      </Link>

      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Blocks className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold font-heading">{server.name}</h1>
              {server.version ? <span className="rounded bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground">{server.version}</span> : null}
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">{server.transport.replace('_', ' ')}</span>
              {server.category ? <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">{server.category}</span> : null}
            </div>
            {server.summary ? <p className="mt-2 max-w-2xl text-muted-foreground">{server.summary}</p> : null}
            <p className="mt-3 text-xs text-muted-foreground">
              {t('mcp.author')}: {server.authorName || server.authorId}
            </p>
          </div>
        </div>
        {canManage ? (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => void navigate({ to: '/dashboard/mcp/$slug/edit', params: { slug: server.slug } })}>
              <Pencil className="mr-1 h-4 w-4" />
              {t('mcp.edit')}
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm(t('mcp.deleteConfirm'))) deleteMutation.mutate()
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {t('mcp.delete')}
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border/60 bg-card p-6">
            <h2 className="text-lg font-semibold font-heading">{t('mcp.about')}</h2>
            {server.description ? (
              <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-muted-foreground">
                {server.description}
              </pre>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{t('mcp.noDescription')}</p>
            )}
          </section>

          <section className="rounded-xl border border-border/60 bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold font-heading">{t('mcp.clientConfig')}</h2>
              <Button size="sm" variant="outline" onClick={() => void copyConfig()}>
                {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                {copied ? t('mcp.copied') : t('mcp.copy')}
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t('mcp.configHint')}</p>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-secondary/50 p-4 text-xs leading-6 text-foreground">
              <code>{configText}</code>
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              {isRemote ? t('mcp.instructionsRemote') : t('mcp.instructionsStdio')}
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Paperclip className="h-4 w-4" />
              {t('mcp.attachmentTitle')}
            </h2>
            {server.attachmentFilename ? (
              <>
                <p className="mt-3 truncate text-sm font-medium">{server.attachmentFilename}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {server.attachmentSizeBytes ? formatBytes(server.attachmentSizeBytes) : ''}
                </p>
                <a
                  href={mcpAttachmentUrl(server.slug)}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Download className="mr-1 h-4 w-4" />
                  {t('mcp.downloadAttachment')}
                </a>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{t('mcp.noAttachment')}</p>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {isRemote ? <Globe className="h-4 w-4" /> : <Terminal className="h-4 w-4" />}
              {t('mcp.connection')}
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('mcp.transport')}</dt>
                <dd className="mt-0.5 font-medium">{server.transport.replace('_', ' ')}</dd>
              </div>
              {isRemote ? (
                <div>
                  <dt className="text-muted-foreground">{t('mcp.endpoint')}</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs">{server.endpointUrl}</dd>
                </div>
              ) : (
                <div>
                  <dt className="text-muted-foreground">{t('mcp.command')}</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs">{server.command}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">{t('mcp.package')}</dt>
                <dd className="mt-0.5 break-all font-mono text-xs">{server.packageName || server.packageType}</dd>
              </div>
              {server.tags.length ? (
                <div>
                  <dt className="text-muted-foreground">{t('mcp.tags')}</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {server.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border/60 px-2 py-0.5 text-[11px]">{tag}</span>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5 text-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <Server className="h-4 w-4" />
              {t('mcp.installTitle')}
            </h2>
            <p className="mt-2 text-muted-foreground">{t('mcp.installHint')}</p>
            {server.docsUrl ? (
              <a href={server.docsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-primary hover:underline">
                {t('mcp.docs')}
              </a>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}
