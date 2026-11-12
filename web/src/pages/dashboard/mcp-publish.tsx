import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Blocks, Code2, FileArchive, Globe, Terminal } from 'lucide-react'
import {
  getMcpServer,
  publishMcpServer,
  updateMcpServer,
  type McpPackageType,
  type McpSaveInput,
  type McpTransport,
} from '@/api/mcp-servers'
import { formatBytes } from '@/features/tools/tool-utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

type PublishMode = 'remote' | 'command' | 'json'
const COMMAND_PACKAGE_TYPES: McpPackageType[] = ['NPM', 'PYPI', 'DOCKER', 'CUSTOM']

function parseObject(text: string, errorKey: string, t: (key: string) => string): Record<string, unknown> {
  if (!text.trim()) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(t(errorKey))
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(t(errorKey))
  }
  return parsed as Record<string, unknown>
}

function inferMode(config: Record<string, unknown>): PublishMode {
  if (typeof config.command === 'string' && config.command.trim()) return 'command'
  if (typeof config.url === 'string' && config.url.trim()) return 'remote'
  return 'json'
}

export function McpPublishPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams({ strict: false }) as { slug?: string }
  const editing = Boolean(params.slug)

  const [mode, setMode] = useState<PublishMode>('remote')
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [version, setVersion] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [transport, setTransport] = useState<McpTransport>('STREAMABLE_HTTP')
  const [packageType, setPackageType] = useState<McpPackageType>('REMOTE')
  const [packageName, setPackageName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [endpointUrl, setEndpointUrl] = useState('')
  const [headersText, setHeadersText] = useState('{}')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [envText, setEnvText] = useState('{}')
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState('')

  const { data: existing } = useQuery({
    queryKey: ['mcp-servers', 'detail', params.slug],
    queryFn: ({ signal }) => getMcpServer(params.slug!, signal),
    enabled: editing,
    retry: false,
  })

  useEffect(() => {
    if (!existing) return
    setName(existing.name)
    setSummary(existing.summary ?? '')
    setDescription(existing.description ?? '')
    setVersion(existing.version ?? '')
    setCategory(existing.category ?? '')
    setTags(existing.tags.join(', '))
    setTransport(existing.transport)
    setPackageType(existing.packageType)
    setPackageName(existing.packageName ?? '')
    setEndpointUrl(existing.endpointUrl ?? '')
    const config = existing.config
    setHeadersText(JSON.stringify(
      config && typeof config === 'object' && config.headers && typeof config.headers === 'object'
        ? config.headers
        : {},
      null,
      2,
    ))
    setCommand(existing.command ?? '')
    setArgsText(Array.isArray(config?.args) ? config.args.join('\n') : '')
    setEnvText(JSON.stringify(
      config && typeof config === 'object' && config.env && typeof config.env === 'object'
        ? config.env
        : {},
      null,
      2,
    ))
    setJsonText(JSON.stringify(config ?? {}, null, 2))
    setMode(inferMode(config ?? {}))
  }, [existing])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t('mcp.requiredName'))
      let config: Record<string, unknown>
      if (mode === 'remote') {
        if (!endpointUrl.trim()) throw new Error(t('mcp.requiredEndpoint'))
        const headers = parseObject(headersText, 'mcp.invalidJson', t)
        config = {
          type: transport === 'SSE' ? 'sse' : 'streamable-http',
          url: endpointUrl.trim(),
          ...(Object.keys(headers).length ? { headers } : {}),
        }
      } else if (mode === 'command') {
        if (!command.trim()) throw new Error(t('mcp.requiredCommand'))
        const env = parseObject(envText, 'mcp.invalidJson', t)
        config = {
          command: command.trim(),
          args: argsText.split('\n').map((line) => line.trim()).filter(Boolean),
          ...(Object.keys(env).length ? { env } : {}),
        }
      } else {
        config = parseObject(jsonText, 'mcp.invalidJson', t)
        if (!config.command && !config.url) throw new Error(t('mcp.invalidConfig'))
      }

      const input: McpSaveInput = {
        name: name.trim(),
        summary: summary.trim() || undefined,
        description: description.trim() || undefined,
        version: version.trim() || undefined,
        category: category.trim() || undefined,
        transport: mode === 'remote' ? transport : undefined,
        packageType: mode === 'remote' ? 'REMOTE' : mode === 'command' ? packageType : undefined,
        packageName: packageName.trim() || undefined,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        config,
      }
      if (existing) {
        return updateMcpServer(existing.id, input, file)
      }
      return publishMcpServer(input, file)
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      const slug = 'slug' in result ? result.slug : existing?.slug
      if (slug) await navigate({ to: '/mcp/$slug', params: { slug } })
      else await navigate({ to: '/mcp' })
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : t('mcp.publishFailed'))
    },
  })

  const modes = useMemo(() => [
    { key: 'remote' as const, label: t('mcp.modeRemote'), icon: Globe },
    { key: 'command' as const, label: t('mcp.modeCommand'), icon: Terminal },
    { key: 'json' as const, label: t('mcp.modeJson'), icon: Code2 },
  ], [t])

  return (
    <div className={`${APP_SHELL_PAGE_CLASS_NAME} max-w-3xl space-y-6`}>
      <header>
        <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary">
          <Blocks className="h-4 w-4" />
          {t('mcp.badge')}
        </div>
        <h1 className="text-3xl font-bold font-heading">
          {editing ? t('mcp.editTitle') : t('mcp.publishTitle')}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('mcp.publishDescription')}</p>
      </header>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          setError('')
          mutation.mutate()
        }}
      >
        <section className="space-y-4 rounded-xl border border-border/60 bg-card p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mcp-name">{t('mcp.name')}</Label>
              <Input id="mcp-name" required maxLength={256} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcp-version">{t('mcp.version')}</Label>
              <Input id="mcp-version" maxLength={64} value={version} placeholder="1.0.0" onChange={(event) => setVersion(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-summary">{t('mcp.summary')}</Label>
            <Input id="mcp-summary" maxLength={2000} value={summary} onChange={(event) => setSummary(event.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mcp-category">{t('mcp.category')}</Label>
              <Input id="mcp-category" maxLength={64} value={category} onChange={(event) => setCategory(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcp-tags">{t('mcp.tags')}</Label>
              <Input id="mcp-tags" value={tags} placeholder={t('mcp.tagsPlaceholder')} onChange={(event) => setTags(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-description">{t('mcp.descriptionLabel')}</Label>
            <Textarea id="mcp-description" className="min-h-28" maxLength={50000} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-file">{t('mcp.attachment')}</Label>
            <label
              htmlFor="mcp-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-secondary/20 px-4 py-7 text-center transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <FileArchive className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                {file ? file.name : existing?.attachmentFilename || t('mcp.attachmentHint')}
              </span>
              <span className="text-xs text-muted-foreground">
                {file ? formatBytes(file.size) : existing?.attachmentSizeBytes ? formatBytes(existing.attachmentSizeBytes) : t('mcp.attachmentLimit')}
              </span>
            </label>
            <Input
              id="mcp-file"
              className="sr-only"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {existing?.attachmentFilename ? (
              <p className="text-xs text-muted-foreground">
                {t('mcp.replaceAttachment')}
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border/60 bg-card p-5 sm:p-6">
          <div className="flex flex-wrap gap-2">
            {modes.map((item) => {
              const Icon = item.icon
              return (
                <Button
                  key={item.key}
                  type="button"
                  variant={mode === item.key ? 'default' : 'outline'}
                  onClick={() => {
                    setMode(item.key)
                    if (item.key === 'command' && packageType === 'REMOTE') setPackageType('NPM')
                  }}
                >
                  <Icon className="mr-1 h-4 w-4" />
                  {item.label}
                </Button>
              )
            })}
          </div>

          {mode === 'remote' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <div className="space-y-2">
                  <Label htmlFor="mcp-endpoint">{t('mcp.endpoint')}</Label>
                  <Input id="mcp-endpoint" type="url" placeholder="https://example.com/mcp" value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-transport">{t('mcp.transport')}</Label>
                  <select
                    id="mcp-transport"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={transport}
                    onChange={(event) => setTransport(event.target.value as McpTransport)}
                  >
                    <option value="STREAMABLE_HTTP">{t('mcp.transportStreamable')}</option>
                    <option value="SSE">{t('mcp.transportSse')}</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-headers">{t('mcp.headers')}</Label>
                <Textarea id="mcp-headers" className="min-h-20 font-mono text-xs" value={headersText} onChange={(event) => setHeadersText(event.target.value)} />
                <p className="text-xs text-muted-foreground">{t('mcp.headersHint')}</p>
              </div>
            </div>
          ) : null}

          {mode === 'command' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <div className="space-y-2">
                  <Label htmlFor="mcp-command">{t('mcp.command')}</Label>
                  <Input id="mcp-command" placeholder="npx" value={command} onChange={(event) => setCommand(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-package-type">{t('mcp.packageType')}</Label>
                  <select
                    id="mcp-package-type"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={packageType}
                    onChange={(event) => setPackageType(event.target.value as McpPackageType)}
                  >
                    {COMMAND_PACKAGE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-args">{t('mcp.args')}</Label>
                <Textarea id="mcp-args" className="min-h-24 font-mono text-xs" placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir'} value={argsText} onChange={(event) => setArgsText(event.target.value)} />
                <p className="text-xs text-muted-foreground">{t('mcp.argsHint')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-env">{t('mcp.env')}</Label>
                <Textarea id="mcp-env" className="min-h-20 font-mono text-xs" value={envText} onChange={(event) => setEnvText(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-package-name">{t('mcp.packageName')}</Label>
                <Input id="mcp-package-name" value={packageName} onChange={(event) => setPackageName(event.target.value)} />
              </div>
            </div>
          ) : null}

          {mode === 'json' ? (
            <div className="space-y-2">
              <Label htmlFor="mcp-json">{t('mcp.jsonConfig')}</Label>
              <Textarea
                id="mcp-json"
                className="min-h-64 font-mono text-xs"
                placeholder={'{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "@scope/server"]\n    }\n  }\n}'}
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('mcp.jsonHint')}</p>
            </div>
          ) : null}
        </section>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => void navigate({ to: '/mcp' })}>
            {t('mcp.cancel')}
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('mcp.saving') : editing ? t('mcp.saveChanges') : t('mcp.submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}
