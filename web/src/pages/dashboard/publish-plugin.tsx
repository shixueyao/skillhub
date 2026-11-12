import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FileArchive, Loader2, PackageCheck, Upload } from 'lucide-react'
import type { DshPluginPublishInput } from '@/api/dsh-plugins'
import { useDshPluginPackagePreview, usePublishDshPlugin } from '@/shared/hooks/use-dsh-plugin-queries'
import { useMyNamespaces } from '@/shared/hooks/use-namespace-queries'
import { toast } from '@/shared/lib/toast'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

export function PublishPluginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const search = useSearch({ from: '/dashboard/plugins/publish' })
  const { data: namespaces = [], isLoading: namespacesLoading } = useMyNamespaces()
  const activeNamespaces = useMemo(
    () => namespaces.filter((namespace) => namespace.status === 'ACTIVE'),
    [namespaces],
  )

  const [namespace, setNamespace] = useState(search.namespace ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [homepage, setHomepage] = useState('')
  const [license, setLicense] = useState('')
  const [compatNote, setCompatNote] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')

  const effectiveNamespace = namespace || activeNamespaces[0]?.slug || ''
  const preview = useDshPluginPackagePreview(effectiveNamespace, file)
  const publishMutation = usePublishDshPlugin()

  const versionExists = preview.data?.versionExists === true
  const canSubmit = Boolean(file)
    && Boolean(effectiveNamespace)
    && Boolean(preview.data)
    && !versionExists
    && !publishMutation.isPending

  const submit = () => {
    if (!file || !effectiveNamespace) {
      toast.error(t('plugin.publish.required'))
      return
    }
    const input: DshPluginPublishInput = {
      displayName: displayName || undefined,
      summary: summary || undefined,
      description: description || undefined,
      homepage: homepage || undefined,
      license: license || undefined,
      category: category || undefined,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      compatNote: compatNote || undefined,
      releaseNotes: releaseNotes || undefined,
    }
    publishMutation.mutate(
      { namespace: effectiveNamespace, file, input },
      {
        onSuccess: (result) => {
          toast.success(
            t('plugin.publish.success'),
            t('plugin.publish.successDescription', {
              packageName: result.packageName,
              version: result.version,
            }),
          )
          void navigate({
            to: '/plugins/$namespace/$slug',
            params: { namespace: result.namespace, slug: result.slug },
          })
        },
        onError: (error) => toast.error(
          t('plugin.publish.failed'),
          error instanceof Error ? error.message : '',
        ),
      },
    )
  }

  return (
    <div className={`${APP_SHELL_PAGE_CLASS_NAME} max-w-4xl`}>
      <div>
        <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary">
          <Upload className="h-4 w-4" /> {t('plugin.publish.title')}
        </div>
        <h1 className="text-3xl font-bold font-heading">{t('plugin.publish.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('plugin.publish.subtitle')}</p>
      </div>

      <section className="space-y-4 rounded-lg border border-border/60 bg-card p-[var(--card-padding)]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="dsh-plugin-namespace">{t('plugin.publish.namespace')}</Label>
            <Select
              value={effectiveNamespace}
              onValueChange={setNamespace}
              disabled={namespacesLoading || activeNamespaces.length === 0}
            >
              <SelectTrigger id="dsh-plugin-namespace">
                <SelectValue placeholder={t('plugin.publish.selectNamespace')} />
              </SelectTrigger>
              <SelectContent>
                {activeNamespaces.map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.displayName} (@{item.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="dsh-plugin-file">{t('plugin.publish.file')}</Label>
            <Input
              id="dsh-plugin-file"
              type="file"
              accept=".tgz,application/gzip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">{t('plugin.publish.fileHint')}</p>
          </div>
        </div>

        {file ? (
          <div className="rounded-md border border-border/60 bg-secondary/20 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <FileArchive className="h-4 w-4" />
              {file.name}
              <span className="text-xs text-muted-foreground">({formatSize(file.size)})</span>
              {preview.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            </div>
            {preview.isError ? (
              <p className="mt-2 text-destructive">
                {t('plugin.publish.previewFailed')}
                {preview.error instanceof Error ? `: ${preview.error.message}` : ''}
              </p>
            ) : null}
            {preview.data ? (
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                <p className="flex flex-wrap items-center gap-2 text-foreground">
                  <PackageCheck className="h-3.5 w-3.5" />
                  <span className="font-mono">{preview.data.packageName}</span>
                  <span>v{preview.data.version}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                    {t(preview.data.newPlugin ? 'plugin.publish.newPlugin' : 'plugin.publish.existingPlugin', {
                      namespace: preview.data.existingNamespace ?? '',
                      slug: preview.data.existingSlug ?? '',
                    })}
                  </span>
                </p>
                {preview.data.description ? <p>{preview.data.description}</p> : null}
                {preview.data.capabilities?.length ? (
                  <p>{t('plugin.publish.capabilities')}: {preview.data.capabilities.join(', ')}</p>
                ) : null}
                {preview.data.engines?.node ? (
                  <p>{t('plugin.publish.engines')}: node {preview.data.engines.node}</p>
                ) : null}
                {versionExists ? (
                  <p className="font-medium text-destructive">
                    {t('plugin.publish.versionExists')} — {t('plugin.publish.versionExistsHint')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-lg border border-border/60 bg-card p-[var(--card-padding)] sm:grid-cols-2">
        <Field label={t('plugin.publish.displayName')} htmlFor="dsh-plugin-display-name">
          <Input
            id="dsh-plugin-display-name"
            value={displayName}
            maxLength={256}
            placeholder={preview.data?.packageName ?? ''}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>
        <Field label={t('plugin.publish.category')} htmlFor="dsh-plugin-category">
          <Input
            id="dsh-plugin-category"
            value={category}
            maxLength={64}
            placeholder={t('plugin.publish.categoryPlaceholder')}
            onChange={(event) => setCategory(event.target.value)}
          />
        </Field>
        <Field label={t('plugin.publish.summary')} htmlFor="dsh-plugin-summary" className="sm:col-span-2">
          <Textarea
            id="dsh-plugin-summary"
            value={summary}
            maxLength={2000}
            placeholder={preview.data?.description ?? ''}
            onChange={(event) => setSummary(event.target.value)}
          />
        </Field>
        <Field label={t('plugin.publish.description')} htmlFor="dsh-plugin-description" className="sm:col-span-2">
          <Textarea
            id="dsh-plugin-description"
            className="min-h-24"
            value={description}
            maxLength={20000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field label={t('plugin.publish.tags')} htmlFor="dsh-plugin-tags">
          <Input
            id="dsh-plugin-tags"
            value={tags}
            placeholder="official, dsh"
            onChange={(event) => setTags(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('plugin.publish.tagsHint')}</p>
        </Field>
        <Field label={t('plugin.publish.license')} htmlFor="dsh-plugin-license">
          <Input
            id="dsh-plugin-license"
            value={license}
            maxLength={64}
            placeholder={preview.data?.license ?? 'Apache-2.0'}
            onChange={(event) => setLicense(event.target.value)}
          />
        </Field>
        <Field label={t('plugin.publish.homepage')} htmlFor="dsh-plugin-homepage" className="sm:col-span-2">
          <Input
            id="dsh-plugin-homepage"
            value={homepage}
            maxLength={512}
            placeholder={preview.data?.homepage ?? ''}
            onChange={(event) => setHomepage(event.target.value)}
          />
        </Field>
        <Field label={t('plugin.publish.compatNote')} htmlFor="dsh-plugin-compat" className="sm:col-span-2">
          <Input
            id="dsh-plugin-compat"
            value={compatNote}
            onChange={(event) => setCompatNote(event.target.value)}
          />
        </Field>
        <Field label={t('plugin.publish.releaseNotes')} htmlFor="dsh-plugin-notes" className="sm:col-span-2">
          <Textarea
            id="dsh-plugin-notes"
            className="min-h-20"
            value={releaseNotes}
            maxLength={20000}
            onChange={(event) => setReleaseNotes(event.target.value)}
          />
        </Field>
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => void navigate({ to: '/dashboard/plugins' })}>
          {t('dialog.cancel')}
        </Button>
        <Button disabled={!canSubmit} onClick={submit}>
          {publishMutation.isPending ? t('plugin.publish.publishing') : t('plugin.publish.submit')}
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`grid gap-2 ${className ?? ''}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function formatSize(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
