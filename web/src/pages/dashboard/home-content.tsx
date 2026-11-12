import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Eye, RotateCcw, Save } from 'lucide-react'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { toast } from '@/shared/lib/toast'
import { withBasePath } from '@/shared/lib/base-path'
import {
  HomeContentConflictError,
  loadDefaultHomeContent,
  loadHomeContent,
  saveHomeContent,
  type PortalHomeContent,
} from '@/features/portal/home-content'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

export function HomeContentPage() {
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
    () => Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(data),
    [draft, data],
  )

  const update = (next: Partial<PortalHomeContent>) => {
    setDraft((current) => (current ? { ...current, ...next } : current))
  }

  const reload = async () => {
    const result = await refetch()
    if (result.data) {
      setDraft(result.data)
      setLoadedUpdatedAt(result.data.updatedAt)
      setConflict(false)
    }
  }

  const loadDefault = async () => {
    try {
      const defaults = await loadDefaultHomeContent()
      setDraft({
        ...defaults,
        sections: draft?.sections ?? defaults.sections,
        updatedAt: loadedUpdatedAt,
      })
      toast.success(t('homeContent.defaultLoaded'))
    } catch (error) {
      toast.error(t('homeContent.loadFailed'), error instanceof Error ? error.message : '')
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

  if (isLoading) {
    return <SkeletonList count={4} />
  }
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
        title={t('homeContent.title')}
        subtitle={t('homeContent.subtitle')}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => { window.location.href = withBasePath('/') }}>
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
        {t('homeContent.adminHint')}
      </p>

      {conflict ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {t('homeContent.conflictDescription')}
        </div>
      ) : null}

      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => update({ enabled: event.target.checked })}
            />
            {t('homeContent.enabled')}
          </label>
          <Button variant="outline" size="sm" onClick={() => void loadDefault()}>
            {t('homeContent.loadDefault')}
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="portal-hero-title">{t('homeContent.heroTitle')}</Label>
            <Input
              id="portal-hero-title"
              value={draft.hero.title}
              placeholder={t('homeContent.heroTitlePlaceholder')}
              onChange={(event) => update({ hero: { ...draft.hero, title: event.target.value } })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="portal-hero-button">{t('homeContent.buttonText')}</Label>
            <Input
              id="portal-hero-button"
              value={draft.hero.primaryButtonText}
              onChange={(event) => update({ hero: { ...draft.hero, primaryButtonText: event.target.value } })}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="portal-hero-description">{t('homeContent.heroDescription')}</Label>
            <Textarea
              id="portal-hero-description"
              value={draft.hero.description}
              onChange={(event) => update({ hero: { ...draft.hero, description: event.target.value } })}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="portal-hero-url">{t('homeContent.buttonUrl')}</Label>
            <Input
              id="portal-hero-url"
              value={draft.hero.primaryButtonUrl}
              placeholder="/search"
              onChange={(event) => update({ hero: { ...draft.hero, primaryButtonUrl: event.target.value } })}
            />
          </div>
        </div>

        <div className="grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-[auto_180px_1fr]">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.notice.enabled}
              onChange={(event) => update({ notice: { ...draft.notice, enabled: event.target.checked } })}
            />
            {t('homeContent.noticeEnabled')}
          </label>
          <div className="grid gap-2">
            <Label htmlFor="portal-notice-level">{t('homeContent.level')}</Label>
            <select
              id="portal-notice-level"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={draft.notice.level}
              onChange={(event) => update({
                notice: { ...draft.notice, level: event.target.value as PortalHomeContent['notice']['level'] },
              })}
            >
              <option value="info">info</option>
              <option value="success">success</option>
              <option value="warn">warn</option>
              <option value="danger">danger</option>
            </select>
          </div>
          <div className="grid gap-2 sm:col-span-1">
            <Label htmlFor="portal-notice-text">{t('homeContent.noticeText')}</Label>
            <Input
              id="portal-notice-text"
              value={draft.notice.text}
              onChange={(event) => update({ notice: { ...draft.notice, text: event.target.value } })}
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? t('homeContent.saving') : t('homeContent.save')}
        </Button>
      </div>
    </div>
  )
}
