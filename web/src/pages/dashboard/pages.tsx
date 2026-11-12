import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Save } from 'lucide-react'
import {
  MANAGED_PAGE_KEYS,
  MANAGED_TAB_KEYS,
  PageContentConflictError,
  emptyPageContent,
  loadPageContent,
  normalizePageContent,
  savePageContent,
  type ManagedPageKey,
  type ManagedTabKey,
  type PageContent,
} from '@/features/pages/page-content'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { toast } from '@/shared/lib/toast'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

export function PageContentAdminPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['page-content', 'content'],
    queryFn: ({ signal }) => loadPageContent(signal),
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  })
  const [draft, setDraft] = useState<PageContent>(emptyPageContent)
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState('')

  useEffect(() => {
    if (!data) return
    setDraft(normalizePageContent(data))
    setLoadedUpdatedAt(data.updatedAt)
  }, [data])

  const tabDefaults = useMemo<Record<ManagedTabKey, string>>(() => ({
    home: t('nav.landing'),
    apps: t('apps.nav'),
    tools: t('tools.nav'),
    mcp: t('mcp.nav'),
    skills: t('nav.marketplace'),
    suites: t('nav.suites'),
    plugins: t('plugin.nav'),
    publish: t('nav.publish'),
    mySkills: t('sidebar.mySkills'),
    mySuites: t('sidebar.mySuites'),
    myPlugins: t('sidebar.myPlugins'),
    namespaces: t('sidebar.namespaces'),
    dashboard: t('nav.dashboard'),
    help: t('help.nav'),
  }), [t])

  const defaults = useMemo<Record<ManagedPageKey, { title: string; description: string }>>(() => ({
    apps: { title: t('apps.title'), description: t('apps.description') },
    tools: { title: t('tools.title'), description: t('tools.description') },
    mcp: { title: t('mcp.title'), description: t('mcp.description') },
    skills: { title: t('nav.marketplace'), description: t('portal.skillsDescription') },
    suites: { title: t('suite.listTitle'), description: t('suite.listDescription') },
    plugins: { title: t('plugin.listTitle'), description: t('plugin.listDescription') },
  }), [t])

  const updateTabLabel = (key: ManagedTabKey, value: string) => {
    setDraft((current) => ({
      ...current,
      tabLabels: { ...current.tabLabels, [key]: value },
    }))
  }

  const updateHeader = (key: ManagedPageKey, field: 'title' | 'description', value: string) => {
    setDraft((current) => ({
      ...current,
      pages: { ...current.pages, [key]: { ...current.pages[key], [field]: value } },
    }))
  }

  const saveMutation = useMutation({
    mutationFn: () => savePageContent(draft, loadedUpdatedAt),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['page-content', 'content'], saved)
      setDraft(saved)
      setLoadedUpdatedAt(saved.updatedAt)
      toast.success(t('homeContent.saved'))
      await queryClient.invalidateQueries({ queryKey: ['page-content', 'content'] })
    },
    onError: (error) => {
      if (error instanceof PageContentConflictError) {
        toast.error(t('homeContent.conflict'), t('homeContent.conflictDescription'))
      } else {
        toast.error(t('homeContent.saveFailed'), error instanceof Error ? error.message : '')
      }
    },
  })

  if (isLoading) return <SkeletonList count={5} />
  if (isError) {
    return (
      <Card className="space-y-3 p-6">
        <h2 className="text-lg font-semibold">{t('homeContent.loadFailed')}</h2>
        <p className="text-sm text-muted-foreground">{t('homeContent.loadFailedDescription')}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title={t('pages.adminTitle')}
        subtitle={t('pages.adminDescription')}
        actions={(
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="mr-1 h-4 w-4" />
            {saveMutation.isPending ? t('homeContent.saving') : t('homeContent.save')}
          </Button>
        )}
      />

      <p className="rounded-md border border-border/60 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        {t('pages.hint')}
      </p>

      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">{t('pages.siteName')}</h2>
        <div className="max-w-xl space-y-2">
          <Label htmlFor="site-name">{t('pages.siteNameField')}</Label>
          <Input
            id="site-name"
            value={draft.siteName}
            maxLength={64}
            placeholder="SkillHub"
            onChange={(event) => setDraft((current) => ({ ...current, siteName: event.target.value }))}
          />
          <p className="text-xs text-muted-foreground">{t('pages.siteNameHint')}</p>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold">{t('pages.tabLabels')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('pages.tabLabelsHint')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MANAGED_TAB_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`tab-label-${key}`}>{tabDefaults[key]}</Label>
              <Input
                id={`tab-label-${key}`}
                value={draft.tabLabels[key]}
                placeholder={tabDefaults[key]}
                maxLength={80}
                onChange={(event) => updateTabLabel(key, event.target.value)}
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {MANAGED_PAGE_KEYS.map((key) => (
          <Card key={key} className="space-y-4 p-5">
            <h2 className="text-base font-semibold">{defaults[key].title}</h2>
            <div className="space-y-2">
              <Label htmlFor={`page-${key}-title`}>{t('pages.titleField')}</Label>
              <Input
                id={`page-${key}-title`}
                value={draft.pages[key].title}
                placeholder={defaults[key].title}
                onChange={(event) => updateHeader(key, 'title', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`page-${key}-description`}>{t('pages.descriptionField')}</Label>
              <Textarea
                id={`page-${key}-description`}
                className="min-h-24"
                value={draft.pages[key].description}
                placeholder={defaults[key].description}
                onChange={(event) => updateHeader(key, 'description', event.target.value)}
              />
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="mr-1 h-4 w-4" />
          {saveMutation.isPending ? t('homeContent.saving') : t('homeContent.save')}
        </Button>
      </div>
    </div>
  )
}
