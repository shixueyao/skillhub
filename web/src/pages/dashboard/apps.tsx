import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Eye, RotateCcw, Save } from 'lucide-react'
import { PortalSectionsEditor } from '@/features/portal/portal-sections-editor'
import {
  HomeContentConflictError,
  loadHomeContent,
  saveHomeContent,
  type PortalHomeContent,
} from '@/features/portal/home-content'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { toast } from '@/shared/lib/toast'
import { withBasePath } from '@/shared/lib/base-path'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'

export function AppsAdminPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['home-content', 'admin'],
    queryFn: ({ signal }) => loadHomeContent(signal),
    retry: false,
  })
  const [draft, setDraft] = useState<PortalHomeContent | null>(null)
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)

  useEffect(() => {
    if (!data) return
    setDraft(data)
    setLoadedUpdatedAt(data.updatedAt)
    setConflict(false)
  }, [data])

  const dirty = useMemo(
    () => Boolean(draft) && JSON.stringify(draft?.sections) !== JSON.stringify(data?.sections),
    [draft, data],
  )

  const reload = async () => {
    const result = await refetch()
    if (result.data) {
      setDraft(result.data)
      setLoadedUpdatedAt(result.data.updatedAt)
      setConflict(false)
    }
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const saved = await saveHomeContent(draft, loadedUpdatedAt)
      queryClient.setQueryData(['home-content', 'admin'], saved)
      setDraft(saved)
      setLoadedUpdatedAt(saved.updatedAt)
      setConflict(false)
      toast.success(t('homeContent.saved'))
    } catch (error) {
      if (error instanceof HomeContentConflictError) {
        setConflict(true)
        toast.error(t('homeContent.conflict'), t('homeContent.conflictDescription'))
      } else {
        toast.error(t('homeContent.saveFailed'), error instanceof Error ? error.message : '')
      }
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <SkeletonList count={4} />
  if (isError) {
    return (
      <Card className="space-y-3 p-6">
        <h2 className="text-lg font-semibold">{t('homeContent.loadFailed')}</h2>
        <p className="text-sm text-muted-foreground">{t('homeContent.loadFailedDescription')}</p>
        <Button variant="outline" onClick={() => void reload()}>{t('homeContent.reload')}</Button>
      </Card>
    )
  }
  if (!draft) return null

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title={t('apps.adminTitle')}
        subtitle={t('apps.adminDescription')}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => { window.location.href = withBasePath('/apps') }}>
              <Eye className="mr-1 h-4 w-4" />
              {t('homeContent.preview')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void reload()} disabled={saving}>
              <RotateCcw className="mr-1 h-4 w-4" />
              {t('homeContent.reload')}
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
              <Save className="mr-1 h-4 w-4" />
              {saving ? t('homeContent.saving') : t('homeContent.save')}
            </Button>
          </div>
        )}
      />

      <p className="rounded-md border border-border/60 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        {t('homeContent.appsHint')}
      </p>

      {conflict ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {t('homeContent.conflictDescription')}
        </div>
      ) : null}

      <PortalSectionsEditor
        sections={draft.sections}
        onChange={(sections) => setDraft((current) => current ? { ...current, sections } : current)}
      />

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? t('homeContent.saving') : t('homeContent.save')}
        </Button>
      </div>
    </div>
  )
}
