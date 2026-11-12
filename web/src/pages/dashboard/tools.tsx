import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  deleteAiTool,
  getAiTool,
  listAiTools,
  updateAiTool,
  type AiToolMetadataInput,
  type AiToolSummary,
} from '@/api/ai-tools'
import { formatBytes } from '@/features/tools/tool-utils'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { EmptyState } from '@/shared/components/empty-state'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

export function AdminToolsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AiToolSummary | null>(null)
  const [deleting, setDeleting] = useState<AiToolSummary | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['ai-tools', 'admin'],
    queryFn: ({ signal }) => listAiTools({ size: 100, sort: 'newest' }, signal),
    retry: false,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: AiToolMetadataInput }) => updateAiTool(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-tools'] })
      setEditing(null)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAiTool(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-tools'] })
      setDeleting(null)
    },
  })

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title={t('tools.admin.title')}
        subtitle={t('tools.admin.description')}
        actions={(
          <Button size="sm" onClick={() => void navigate({ to: '/dashboard/tools/publish' })}>
            <Plus className="mr-1 h-4 w-4" />
            {t('tools.upload')}
          </Button>
        )}
      />

      {isLoading ? <SkeletonList count={5} /> : null}
      {!isLoading && !data?.items.length ? (
        <EmptyState title={t('tools.admin.empty')} description={t('tools.admin.emptyDescription')} />
      ) : null}

      {data?.items.length ? (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="hidden grid-cols-[minmax(0,2fr)_120px_100px_100px_120px] gap-4 border-b border-border/60 px-4 py-3 text-xs font-medium text-muted-foreground md:grid">
            <span>{t('tools.admin.name')}</span>
            <span>{t('tools.admin.category')}</span>
            <span>{t('tools.admin.size')}</span>
            <span>{t('tools.admin.downloads')}</span>
            <span className="text-right">{t('tools.admin.actions')}</span>
          </div>
          <ul className="divide-y divide-border/50">
            {data.items.map((tool) => (
              <li key={tool.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,2fr)_120px_100px_100px_120px] md:items-center md:gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{tool.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{tool.filename}{tool.version ? ` · ${tool.version}` : ''}</p>
                </div>
                <span className="text-sm text-muted-foreground">{tool.category || '—'}</span>
                <span className="text-sm text-muted-foreground">{formatBytes(tool.sizeBytes)}</span>
                <span className="text-sm text-muted-foreground">{tool.downloadCount}</span>
                <div className="flex gap-1 md:justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(tool)} aria-label={t('tools.admin.edit')}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(tool)} aria-label={t('tools.admin.delete')}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editing ? (
        <EditToolDialog
          key={editing.id}
          tool={editing}
          pending={updateMutation.isPending}
          error={updateMutation.isError ? (updateMutation.error as Error).message : null}
          onClose={() => setEditing(null)}
          onSubmit={(input) => updateMutation.mutate({ id: editing.id, input })}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title={t('tools.admin.deleteTitle')}
        description={t('tools.admin.deleteDescription', { name: deleting?.name ?? '' })}
        variant="destructive"
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id)
        }}
      />
    </div>
  )
}

function EditToolDialog({
  tool,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  tool: AiToolSummary
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: AiToolMetadataInput) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(tool.name)
  const [version, setVersion] = useState(tool.version ?? '')
  const [category, setCategory] = useState(tool.category ?? '')
  const [summary, setSummary] = useState(tool.summary ?? '')
  const [usage, setUsage] = useState('')
  const { data: detail } = useQuery({
    queryKey: ['ai-tools', 'detail', tool.id],
    queryFn: ({ signal }) => getAiTool(tool.id, signal),
    retry: false,
  })

  useEffect(() => {
    if (detail) setUsage(detail.usageInstructions ?? '')
  }, [detail])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('tools.admin.editTitle')}</DialogTitle>
          <DialogDescription>{tool.filename}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit({ name, version, category, summary, usageInstructions: usage })
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ai-tool-edit-name">{t('tools.publish.name')}</Label>
              <Input id="ai-tool-edit-name" required maxLength={256} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-tool-edit-version">{t('tools.publish.version')}</Label>
              <Input id="ai-tool-edit-version" maxLength={64} value={version} onChange={(event) => setVersion(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-tool-edit-category">{t('tools.publish.category')}</Label>
            <Input id="ai-tool-edit-category" maxLength={64} value={category} onChange={(event) => setCategory(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-tool-edit-summary">{t('tools.publish.summary')}</Label>
            <Textarea id="ai-tool-edit-summary" maxLength={2000} value={summary} onChange={(event) => setSummary(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-tool-edit-usage">{t('tools.publish.usage')}</Label>
            <Textarea
              id="ai-tool-edit-usage"
              className="min-h-32"
              maxLength={20000}
              value={usage}
              disabled={!detail}
              onChange={(event) => setUsage(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('dialog.cancel')}</Button>
            <Button type="submit" disabled={pending || !detail}>{pending ? t('dialog.processing') : t('dialog.confirm')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
