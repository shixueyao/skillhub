import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Download, FileArchive, ShieldCheck } from 'lucide-react'
import { aiToolDownloadUrl, getAiTool } from '@/api/ai-tools'
import { formatBytes, toolInitial } from '@/features/tools/tool-utils'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { Button } from '@/shared/ui/button'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

export function ToolDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { toolId } = useParams({ strict: false }) as { toolId?: string }
  const id = Number(toolId)
  const { data: tool, isLoading, isError } = useQuery({
    queryKey: ['ai-tools', 'detail', id],
    queryFn: ({ signal }) => getAiTool(id, signal),
    enabled: Number.isFinite(id) && id > 0,
    retry: false,
  })

  if (isLoading) {
    return <div className={APP_SHELL_PAGE_CLASS_NAME}><SkeletonList count={3} /></div>
  }
  if (isError || !tool) {
    return (
      <div className={`${APP_SHELL_PAGE_CLASS_NAME} space-y-4`}>
        <p className="text-sm text-destructive">{t('tools.notFound')}</p>
        <Button variant="outline" onClick={() => void navigate({ to: '/tools' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('tools.back')}
        </Button>
      </div>
    )
  }

  return (
    <div className={`${APP_SHELL_PAGE_CLASS_NAME} space-y-8`}>
      <Link to="/tools" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t('tools.back')}
      </Link>

      <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
            {toolInitial(tool.name)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold font-heading">{tool.name}</h1>
              {tool.version ? <span className="rounded bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground">{tool.version}</span> : null}
              {tool.category ? <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">{tool.category}</span> : null}
            </div>
            {tool.summary ? <p className="mt-2 max-w-2xl text-muted-foreground">{tool.summary}</p> : null}
          </div>
        </div>
        <Button className="shrink-0" onClick={() => { window.location.href = aiToolDownloadUrl(tool.id) }}>
          <Download className="mr-1 h-4 w-4" />
          {t('tools.download')}
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-border/60 bg-card p-6">
          <h2 className="text-lg font-semibold font-heading">{t('tools.usage')}</h2>
          {tool.usageInstructions ? (
            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-muted-foreground">
              {tool.usageInstructions}
            </pre>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t('tools.noUsage')}</p>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FileArchive className="h-4 w-4" />
              {t('tools.file')}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t('tools.filename')}</dt>
                <dd className="truncate text-right font-medium">{tool.filename}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t('tools.size')}</dt>
                <dd className="font-medium">{formatBytes(tool.sizeBytes)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t('tools.downloads')}</dt>
                <dd className="font-medium">{tool.downloadCount}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4" />
              {t('tools.checksum')}
            </h2>
            <code className="mt-3 block break-all rounded bg-secondary/50 p-2 text-[11px] leading-5 text-muted-foreground">
              {tool.sha256}
            </code>
          </div>
        </aside>
      </div>
    </div>
  )
}
