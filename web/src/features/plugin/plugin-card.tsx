import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Puzzle, ShieldCheck } from 'lucide-react'
import type { DshPluginSummary } from '@/api/dsh-plugins'
import { formatLocalDateTime } from '@/shared/lib/date-time'
import { cn } from '@/shared/lib/utils'
import { Card } from '@/shared/ui/card'

interface DshPluginCardProps {
  plugin: DshPluginSummary
  onOpen: () => void
}

export function DshPluginCard({ plugin, onOpen }: DshPluginCardProps) {
  const { t, i18n } = useTranslation()

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className="flex h-full cursor-pointer flex-col p-[var(--card-padding)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Puzzle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold font-heading">{plugin.displayName}</h3>
          <p className="truncate font-mono text-xs text-muted-foreground">{plugin.packageName}</p>
        </div>
      </div>

      <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted-foreground">
        {plugin.summary || t('plugin.noSummary')}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {plugin.hidden ? <Badge tone="warning">{t('plugin.hidden')}</Badge> : null}
        {plugin.category ? <Badge tone="primary">{plugin.category}</Badge> : null}
        {plugin.latestVersion ? (
          <Badge tone="success">{t('plugin.latest', { version: plugin.latestVersion })}</Badge>
        ) : null}
        {plugin.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} tone="muted">{tag}</Badge>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Download className="h-3.5 w-3.5" />
          {t('plugin.downloads', { count: plugin.downloadCount })}
        </span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('plugin.versionCount', { count: plugin.versionCount })}
        </span>
        <span>{formatLocalDateTime(plugin.updatedAt, i18n.language)}</span>
      </div>
    </Card>
  )
}

type BadgeTone = 'primary' | 'success' | 'warning' | 'muted'

function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tone === 'primary' && 'border-primary/20 bg-primary/10 text-primary',
        tone === 'success' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        tone === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        tone === 'muted' && 'border-border/60 bg-secondary/50 text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}
