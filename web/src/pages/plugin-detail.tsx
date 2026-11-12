import { useMemo, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowLeft, Copy, EyeOff, Pencil, Puzzle, RotateCcw, Upload } from 'lucide-react'
import type { DshPluginMetadataInput, DshPluginVersion } from '@/api/dsh-plugins'
import { dshPluginInstallCommand } from '@/api/dsh-plugins'
import { DshPluginEditDialog } from '@/features/plugin/plugin-edit-dialog'
import { DshPluginVersionTable } from '@/features/plugin/plugin-version-table'
import {
  useDeleteDshPluginVersion,
  useDshPluginDetail,
  useRecommendDshPluginVersion,
  useSetDshPluginHidden,
  useUnyankDshPluginVersion,
  useUpdateDshPlugin,
  useYankDshPluginVersion,
} from '@/shared/hooks/use-dsh-plugin-queries'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { CopyButton } from '@/shared/components/copy-button'
import { EmptyState } from '@/shared/components/empty-state'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { copyToClipboard } from '@/shared/lib/clipboard'
import { formatLocalDateTime } from '@/shared/lib/date-time'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

type PendingAction =
  | { kind: 'yank'; version: DshPluginVersion }
  | { kind: 'delete'; version: DshPluginVersion }
  | { kind: 'hide' }
  | { kind: 'restore' }

export function PluginDetailPage() {
  const { namespace, slug } = useParams({ from: '/plugins/$namespace/$slug' })
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { data: plugin, isLoading, error } = useDshPluginDetail(namespace, slug)
  const updateMutation = useUpdateDshPlugin()
  const yankMutation = useYankDshPluginVersion()
  const unyankMutation = useUnyankDshPluginVersion()
  const recommendMutation = useRecommendDshPluginVersion()
  const deleteMutation = useDeleteDshPluginVersion()
  const hiddenMutation = useSetDshPluginHidden()

  const [editOpen, setEditOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [yankReason, setYankReason] = useState('')

  const latest = useMemo(
    () => plugin?.versions.find((version) => version.recommended) ?? plugin?.versions[0],
    [plugin],
  )
  const actionPending = yankMutation.isPending || unyankMutation.isPending
    || recommendMutation.isPending || deleteMutation.isPending || hiddenMutation.isPending

  if (isLoading) {
    return <div className={APP_SHELL_PAGE_CLASS_NAME}><SkeletonList count={3} /></div>
  }
  if (!plugin || error) {
    return (
      <div className={APP_SHELL_PAGE_CLASS_NAME}>
        <EmptyState title={t('plugin.detail.notFound')} description={t('plugin.detail.notFoundDescription')} />
      </div>
    )
  }

  const manageable = plugin.allowedActions.length > 0
  const canPublishVersion = plugin.allowedActions.includes('PUBLISH_VERSION')
  const canHide = plugin.allowedActions.includes('HIDE')
  const canRestore = plugin.allowedActions.includes('RESTORE')

  const copy = async (text: string) => {
    try {
      await copyToClipboard(text)
      toast.success(t('copyButton.copied'))
    } catch {
      toast.error(t('plugin.manage.failed'))
    }
  }

  const handleMetadata = (input: DshPluginMetadataInput) => {
    updateMutation.mutate(
      { pluginId: plugin.id, input },
      {
        onSuccess: () => {
          setEditOpen(false)
          toast.success(t('plugin.manage.saved'))
        },
        onError: (mutationError) => toast.error(
          t('plugin.manage.failed'),
          mutationError instanceof Error ? mutationError.message : '',
        ),
      },
    )
  }

  const handleConfirm = () => {
    if (!pendingAction) return
    const onSuccess = (message: string) => {
      setPendingAction(null)
      setYankReason('')
      toast.success(message)
    }
    const onError = (mutationError: unknown) => toast.error(
      t('plugin.manage.failed'),
      mutationError instanceof Error ? mutationError.message : '',
    )
    if (pendingAction.kind === 'yank') {
      yankMutation.mutate(
        { pluginId: plugin.id, versionId: pendingAction.version.id, reason: yankReason },
        { onSuccess: () => onSuccess(t('plugin.manage.yanked')), onError },
      )
    } else if (pendingAction.kind === 'delete') {
      deleteMutation.mutate(
        { pluginId: plugin.id, versionId: pendingAction.version.id },
        { onSuccess: () => onSuccess(t('plugin.manage.deleted')), onError },
      )
    } else {
      hiddenMutation.mutate(
        { pluginId: plugin.id, hidden: pendingAction.kind === 'hide' },
        {
          onSuccess: () => onSuccess(t(pendingAction.kind === 'hide' ? 'plugin.manage.hidden' : 'plugin.manage.restored')),
          onError,
        },
      )
    }
  }

  const confirmTitle = pendingAction?.kind === 'yank'
    ? t('plugin.manage.yankTitle', { version: pendingAction.version.version })
    : pendingAction?.kind === 'delete'
      ? t('plugin.manage.deleteTitle', { version: pendingAction.version.version })
      : pendingAction?.kind === 'hide'
        ? t('plugin.manage.hideTitle', { name: plugin.displayName })
        : t('plugin.manage.restoreTitle', { name: plugin.displayName })

  const confirmDescription = pendingAction?.kind === 'yank'
    ? t('plugin.manage.yankDescription')
    : pendingAction?.kind === 'delete'
      ? t('plugin.manage.deleteDescription')
      : pendingAction?.kind === 'hide'
        ? t('plugin.manage.hideDescription')
        : t('plugin.manage.restoreDescription')

  return (
    <div className={APP_SHELL_PAGE_CLASS_NAME}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit"
        onClick={() => navigate({ to: '/plugins' })}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        {t('plugin.detail.back')}
      </Button>

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-start gap-4">
          <span className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Puzzle className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold font-heading">{plugin.displayName}</h1>
            <p className="mt-1 break-all font-mono text-sm text-muted-foreground">{plugin.packageName}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>@{plugin.namespace}</span>
              {plugin.category ? <span>· {plugin.category}</span> : null}
              <span>· {t('plugin.downloads', { count: plugin.downloadCount })}</span>
              <span>· {t('plugin.updatedAt')} {formatLocalDateTime(plugin.updatedAt, i18n.language)}</span>
            </div>
            {plugin.tags.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {plugin.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {manageable ? (
          <div className="flex flex-wrap gap-2">
            {canPublishVersion ? (
              <Button
                data-analytics-id="plugin.version.publish"
                onClick={() => navigate({
                  to: '/dashboard/plugins/publish',
                  search: { namespace: plugin.namespace },
                })}
              >
                <Upload className="mr-1 h-4 w-4" />
                {t('plugin.detail.newVersionAction')}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-4 w-4" />
              {t('plugin.detail.editAction')}
            </Button>
            {canHide ? (
              <Button variant="outline" onClick={() => setPendingAction({ kind: 'hide' })}>
                <EyeOff className="mr-1 h-4 w-4" />
                {t('plugin.detail.hideAction')}
              </Button>
            ) : null}
            {canRestore ? (
              <Button variant="outline" onClick={() => setPendingAction({ kind: 'restore' })}>
                <RotateCcw className="mr-1 h-4 w-4" />
                {t('plugin.detail.restoreAction')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {plugin.hidden ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          {t('plugin.hiddenNotice')}
        </div>
      ) : null}

      {latest ? (
        <section className="space-y-3 rounded-lg border border-border/60 bg-card p-[var(--card-padding)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold font-heading">{t('plugin.detail.installTitle')}</h2>
            <span className="font-mono text-xs text-muted-foreground">v{latest.version}</span>
          </div>
          <p className="text-sm text-muted-foreground">{t('plugin.detail.installHint')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-secondary/50 px-3 py-2 font-mono text-xs">
              {dshPluginInstallCommand(plugin.namespace, plugin.slug, latest.version)}
            </code>
            <CopyButton text={dshPluginInstallCommand(plugin.namespace, plugin.slug, latest.version)} />
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t('plugin.checksum')}</dt>
              <dd className="flex items-center gap-1 font-mono text-xs">
                <span className="truncate" title={latest.sha256}>{latest.sha256.slice(0, 24)}…</span>
                <Button size="sm" variant="ghost" onClick={() => copy(latest.sha256)} aria-label={t('copyButton.copy')}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('plugin.detail.compatibility')}</dt>
              <dd className="text-xs">
                {latest.engines.node ? <div>node {latest.engines.node}</div> : null}
                {latest.capabilities.length ? <div>{latest.capabilities.join(', ')}</div> : null}
                {!latest.engines.node && !latest.capabilities.length ? (
                  <span className="text-muted-foreground">{t('plugin.detail.noCompatibility')}</span>
                ) : null}
              </dd>
            </div>
          </dl>
          {latest.compatNote ? <p className="text-xs text-muted-foreground">{latest.compatNote}</p> : null}
        </section>
      ) : null}

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">{t('plugin.detail.versionsTitle')}</TabsTrigger>
          <TabsTrigger value="overview">{t('plugin.detail.overview')}</TabsTrigger>
        </TabsList>
        <TabsContent value="versions" className="space-y-3">
          {plugin.versions.some((version) => version.status === 'YANKED') ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {t('plugin.detail.yankedNotice')}
            </p>
          ) : null}
          <DshPluginVersionTable
            plugin={plugin}
            pending={actionPending}
            onYank={(version) => { setYankReason(''); setPendingAction({ kind: 'yank', version }) }}
            onDelete={(version) => setPendingAction({ kind: 'delete', version })}
            onUnyank={(version) => unyankMutation.mutate(
              { pluginId: plugin.id, versionId: version.id },
              {
                onSuccess: () => toast.success(t('plugin.manage.unyanked')),
                onError: (mutationError) => toast.error(
                  t('plugin.manage.failed'),
                  mutationError instanceof Error ? mutationError.message : '',
                ),
              },
            )}
            onRecommend={(version) => recommendMutation.mutate(
              { pluginId: plugin.id, versionId: version.id },
              {
                onSuccess: () => toast.success(t('plugin.manage.recommended')),
                onError: (mutationError) => toast.error(
                  t('plugin.manage.failed'),
                  mutationError instanceof Error ? mutationError.message : '',
                ),
              },
            )}
            onCopy={copy}
          />
        </TabsContent>
        <TabsContent value="overview">
          <div className="space-y-3 rounded-lg border border-border/60 bg-card p-[var(--card-padding)] text-sm">
            <p className={cn('whitespace-pre-wrap', !plugin.description && 'text-muted-foreground')}>
              {plugin.description || plugin.summary || t('plugin.noSummary')}
            </p>
            {plugin.homepage ? (
              <a className="text-primary hover:underline" href={plugin.homepage} target="_blank" rel="noreferrer">
                {plugin.homepage}
              </a>
            ) : null}
            {plugin.license ? (
              <p className="text-xs text-muted-foreground">{t('plugin.publish.license')}: {plugin.license}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t('plugin.createdBy')}: {plugin.createdByName}
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <DshPluginEditDialog
        key={`${plugin.id}-${editOpen}`}
        plugin={plugin}
        open={editOpen}
        pending={updateMutation.isPending}
        onOpenChange={setEditOpen}
        onSubmit={handleMetadata}
      />

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open) setPendingAction(null) }}
        title={confirmTitle}
        description={(
          <span className="space-y-3">
            <span className="block">{confirmDescription}</span>
            {pendingAction?.kind === 'yank' ? (
              <Input
                value={yankReason}
                placeholder={t('plugin.manage.yankReason')}
                onChange={(event) => setYankReason(event.target.value)}
                className="mt-2"
              />
            ) : null}
          </span>
        )}
        confirmText={t('plugin.manage.confirm')}
        variant={pendingAction?.kind === 'delete' ? 'destructive' : 'default'}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
