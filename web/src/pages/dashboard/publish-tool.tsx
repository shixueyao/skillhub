import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileArchive, Upload } from 'lucide-react'
import { listAiToolCategories, publishAiTool } from '@/api/ai-tools'
import { formatBytes } from '@/features/tools/tool-utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

function publishErrorMessage(error: unknown, t: (key: string) => string): string {
  const status = error && typeof error === 'object' && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : 0
  if (status === 401 || status === 403) return t('tools.publish.forbidden')
  if (error instanceof Error && error.message && !/^(Forbidden|Unauthorized)$/i.test(error.message)) {
    return error.message
  }
  return t('tools.publish.failed')
}

function defaultName(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? ''
  return base.replace(/\.(zip|tar\.gz|tgz|tar|exe|msi|dmg|appimage|whl|jar|7z|rar)$/i, '')
}

export function PublishToolPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [category, setCategory] = useState('')
  const [summary, setSummary] = useState('')
  const [usageInstructions, setUsageInstructions] = useState('')

  const { data: categories } = useQuery({
    queryKey: ['ai-tools', 'categories'],
    queryFn: ({ signal }) => listAiToolCategories(signal),
    retry: false,
  })
  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error(t('tools.publish.fileRequired'))
      return publishAiTool(file, {
        name: name.trim() || defaultName(file.name),
        version,
        category,
        summary,
        usageInstructions,
      })
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['ai-tools'] })
      await navigate({ to: '/tools/$toolId', params: { toolId: String(result.id) } })
    },
  })

  return (
    <div className={`${APP_SHELL_PAGE_CLASS_NAME} max-w-3xl space-y-6`}>
      <header>
        <h1 className="text-3xl font-bold font-heading">{t('tools.publish.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('tools.publish.description')}</p>
      </header>

      <form
        className="space-y-5 rounded-xl border border-border/60 bg-card p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="ai-tool-file">{t('tools.publish.file')}</Label>
          <label
            htmlFor="ai-tool-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-secondary/20 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-accent/30"
          >
            <FileArchive className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">{file ? file.name : t('tools.publish.fileHint')}</span>
            <span className="text-xs text-muted-foreground">
              {file ? formatBytes(file.size) : t('tools.publish.fileLimit')}
            </span>
          </label>
          <Input
            id="ai-tool-file"
            className="sr-only"
            type="file"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null
              setFile(selected)
              if (selected && !name) setName(defaultName(selected.name))
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-tool-name">{t('tools.publish.name')}</Label>
            <Input id="ai-tool-name" required maxLength={256} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-tool-version">{t('tools.publish.version')}</Label>
            <Input id="ai-tool-version" maxLength={64} value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.0.0" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-tool-category">{t('tools.publish.category')}</Label>
          <Input
            id="ai-tool-category"
            list="ai-tool-categories"
            maxLength={64}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder={t('tools.publish.categoryPlaceholder')}
          />
          <datalist id="ai-tool-categories">
            {categories?.map((item) => <option key={item.category} value={item.category} />)}
          </datalist>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-tool-summary">{t('tools.publish.summary')}</Label>
          <Textarea id="ai-tool-summary" maxLength={2000} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-tool-usage">{t('tools.publish.usage')}</Label>
          <Textarea
            id="ai-tool-usage"
            className="min-h-40"
            maxLength={20000}
            value={usageInstructions}
            onChange={(event) => setUsageInstructions(event.target.value)}
            placeholder={t('tools.publish.usagePlaceholder')}
          />
        </div>

        {mutation.isError ? (
          <p className="text-sm text-destructive">{publishErrorMessage(mutation.error, t)}</p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => void navigate({ to: '/dashboard/tools' })}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" disabled={mutation.isPending || !file}>
            <Upload className="mr-1 h-4 w-4" />
            {mutation.isPending ? t('tools.publish.publishing') : t('tools.publish.submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}
