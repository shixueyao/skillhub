import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Eye, FilePlus2, Pencil, Save, Trash2 } from 'lucide-react'
import {
  deleteHelpArticle,
  helpArticleFile,
  isValidHelpArticleId,
  loadHelpArticle,
  loadHelpContent,
  saveHelpArticle,
  type HelpArticleDraft,
  type HelpContent,
} from '@/features/help/help-content'
import { MarkdownRenderer } from '@/features/skill/markdown-renderer'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { toast } from '@/shared/lib/toast'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

const EMPTY_DRAFT: HelpArticleDraft = {
  id: '',
  title: '',
  summary: '',
  content: '# 新文章\n\n',
}

export function HelpAdminPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['help', 'content'],
    queryFn: ({ signal }) => loadHelpContent(signal),
    retry: false,
  })
  const [selectedId, setSelectedId] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [draft, setDraft] = useState<HelpArticleDraft>(EMPTY_DRAFT)
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState('')
  const [preview, setPreview] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (!data) return
    setLoadedUpdatedAt(data.updatedAt)
    if (isNew) return
    if (!selectedId && data.articles[0]) setSelectedId(data.articles[0].id)
  }, [data, isNew, selectedId])

  const selected = data?.articles.find((article) => article.id === selectedId)
  const articleQuery = useQuery({
    queryKey: ['help', 'article', selected?.file],
    queryFn: ({ signal }) => loadHelpArticle(selected!.file, signal),
    enabled: Boolean(selected?.file) && !isNew,
    retry: false,
  })

  useEffect(() => {
    if (isNew || !selected) return
    setDraft({ id: selected.id, title: selected.title, summary: selected.summary, content: '' })
  }, [isNew, selected])

  useEffect(() => {
    if (isNew || articleQuery.data === undefined) return
    setDraft((current) => ({ ...current, content: articleQuery.data ?? '' }))
  }, [articleQuery.data, isNew])

  const saveMutation = useMutation({
    mutationFn: () => saveHelpArticle(draft, loadedUpdatedAt),
    onSuccess: async (result) => {
      queryClient.setQueryData(['help', 'content'], result.content)
      setSelectedId(result.article.id)
      setIsNew(false)
      setLoadedUpdatedAt(result.content.updatedAt)
      toast.success(t('help.saved'))
      await queryClient.invalidateQueries({ queryKey: ['help', 'content'] })
    },
    onError: (error) => {
      if (error instanceof Error && error.name === 'HelpContentConflictError') {
        toast.error(t('homeContent.conflict'), t('homeContent.conflictDescription'))
      } else {
        toast.error(t('help.saveFailed'), error instanceof Error ? error.message : '')
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteHelpArticle(selectedId, data?.updatedAt ?? ''),
    onSuccess: async (content: HelpContent) => {
      queryClient.setQueryData(['help', 'content'], content)
      setDeleteOpen(false)
      setSelectedId(content.articles[0]?.id ?? '')
      setDraft(EMPTY_DRAFT)
      toast.success(t('help.deleted'))
      await queryClient.invalidateQueries({ queryKey: ['help', 'content'] })
    },
    onError: (error) => {
      toast.error(t('help.saveFailed'), error instanceof Error ? error.message : '')
    },
  })

  const addArticle = () => {
    setPreview(false)
    setIsNew(true)
    setSelectedId('')
    setDraft(EMPTY_DRAFT)
  }

  const selectArticle = (id: string) => {
    setPreview(false)
    setIsNew(false)
    setSelectedId(id)
  }

  if (isLoading) return <SkeletonList count={4} />
  if (isError || !data) {
    return (
      <Card className="space-y-3 p-6">
        <h2 className="text-lg font-semibold">{t('help.loadFailed')}</h2>
        <p className="text-sm text-muted-foreground">{t('homeContent.loadFailedDescription')}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title={t('help.adminTitle')}
        subtitle={t('help.adminDescription')}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={addArticle}>
              <FilePlus2 className="mr-1 h-4 w-4" />
              {t('help.newArticle')}
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !draft.title.trim() || !isValidHelpArticleId(draft.id) || (!isNew && articleQuery.isLoading)}
            >
              <Save className="mr-1 h-4 w-4" />
              {saveMutation.isPending ? t('homeContent.saving') : t('homeContent.save')}
            </Button>
          </div>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-border/60 bg-card p-2">
          <nav aria-label={t('help.articles')} className="space-y-1">
            {data.articles.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => selectArticle(article.id)}
                className={`block w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                  article.id === selectedId && !isNew ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                }`}
              >
                <span className="block text-sm font-medium">{article.title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs">
                  {article.builtin ? <span className="shrink-0 whitespace-nowrap rounded bg-secondary/70 px-1.5 py-0.5">{t('help.builtin')}</span> : null}
                  <span className="truncate">{article.summary}</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <Card className="space-y-5 p-5">
          {isNew ? (
            <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">{t('help.newArticle')}</p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="help-article-id">{t('help.id')}</Label>
              <Input
                id="help-article-id"
                value={draft.id}
                disabled={!isNew}
                placeholder="my-article"
                onChange={(event) => setDraft({ ...draft, id: event.target.value.trim().toLowerCase() })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="help-article-title">{t('help.articleTitle')}</Label>
              <Input
                id="help-article-title"
                value={draft.title}
                maxLength={160}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="help-article-summary">{t('help.summary')}</Label>
              <Input
                id="help-article-summary"
                value={draft.summary}
                maxLength={240}
                onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="help-article-content">{t('help.content')}</Label>
            <div className="flex gap-1">
              <Button variant={preview ? 'ghost' : 'secondary'} size="sm" onClick={() => setPreview(false)}>
                <Pencil className="mr-1 h-4 w-4" />
                {t('help.edit')}
              </Button>
              <Button variant={preview ? 'secondary' : 'ghost'} size="sm" onClick={() => setPreview(true)}>
                <Eye className="mr-1 h-4 w-4" />
                {t('homeContent.preview')}
              </Button>
            </div>
          </div>

          {preview ? (
            <div className="min-h-[320px] rounded-lg border border-border/60 bg-background p-4">
              <MarkdownRenderer content={draft.content} />
            </div>
          ) : (
            <Textarea
              id="help-article-content"
              className="min-h-[420px] font-mono text-[13px] leading-6"
              value={draft.content}
              maxLength={400_000}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
            <p className="text-xs text-muted-foreground">
              {t('help.fileHint', { file: helpArticleFile(draft.id || 'article') })}
            </p>
            {!isNew && selected && !selected.builtin ? (
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-1 h-4 w-4" />
                {t('homeContent.remove')}
              </Button>
            ) : null}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('help.deleteTitle')}
        description={t('help.deleteDescription', { title: selected?.title ?? '' })}
        variant="destructive"
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
