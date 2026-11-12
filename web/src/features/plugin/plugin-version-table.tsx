import { useTranslation } from 'react-i18next'
import { CheckCircle2, Copy, Download, Trash2, Undo2, XCircle } from 'lucide-react'
import type { DshPluginDetail, DshPluginVersion } from '@/api/dsh-plugins'
import { dshPluginDownloadUrl, dshPluginInstallCommand } from '@/api/dsh-plugins'
import { formatLocalDateTime } from '@/shared/lib/date-time'
import { cn } from '@/shared/lib/utils'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

interface DshPluginVersionTableProps {
  plugin: DshPluginDetail
  onYank: (version: DshPluginVersion) => void
  onUnyank: (version: DshPluginVersion) => void
  onRecommend: (version: DshPluginVersion) => void
  onDelete: (version: DshPluginVersion) => void
  onCopy: (text: string) => void
  pending: boolean
}

export function DshPluginVersionTable({
  plugin,
  onYank,
  onUnyank,
  onRecommend,
  onDelete,
  onCopy,
  pending,
}: DshPluginVersionTableProps) {
  const { t, i18n } = useTranslation()
  const canManage = plugin.allowedActions.length > 0

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('plugin.version')}</TableHead>
          <TableHead>{t('plugin.status')}</TableHead>
          <TableHead>{t('plugin.publishedAt')}</TableHead>
          <TableHead>{t('plugin.size')}</TableHead>
          <TableHead>{t('plugin.checksum')}</TableHead>
          <TableHead className="text-right">{t('plugin.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {plugin.versions.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
              {t('plugin.noVersions')}
            </TableCell>
          </TableRow>
        ) : plugin.versions.map((version) => {
          const yanked = version.status === 'YANKED'
          const command = dshPluginInstallCommand(plugin.namespace, plugin.slug, version.version)
          return (
            <TableRow key={version.id} className={cn(yanked && 'opacity-70')}>
              <TableCell className="font-mono">
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {version.version}
                  {version.recommended ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      {t('plugin.recommended')}
                    </span>
                  ) : null}
                </span>
              </TableCell>
              <TableCell>
                <span className={cn(
                  'inline-flex items-center gap-1 text-xs font-medium',
                  yanked ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
                )}>
                  {yanked ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {t(yanked ? 'plugin.yanked' : 'plugin.published')}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {formatLocalDateTime(version.publishedAt, i18n.language)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {formatBytes(version.sizeBytes)}
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  className="inline-flex max-w-[220px] items-center gap-1 truncate font-mono text-xs text-muted-foreground hover:text-foreground"
                  title={version.sha256}
                  onClick={() => onCopy(version.sha256)}
                >
                  {version.sha256.slice(0, 16)}…
                  <Copy className="h-3 w-3" />
                </button>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={yanked}
                    onClick={() => onCopy(command)}
                    aria-label={t('plugin.copyCommand')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <a
                    href={dshPluginDownloadUrl(plugin.namespace, plugin.slug, version.version)}
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'sm' }),
                      yanked && 'pointer-events-none opacity-50',
                    )}
                    aria-label={t('plugin.download')}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  {canManage && !version.recommended && !yanked ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => onRecommend(version)}
                    >
                      {t('plugin.recommendAction')}
                    </Button>
                  ) : null}
                  {canManage ? (
                    yanked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => onUnyank(version)}
                      >
                        <Undo2 className="mr-1 h-3.5 w-3.5" />
                        {t('plugin.unyankAction')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => onYank(version)}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        {t('plugin.yankAction')}
                      </Button>
                    )
                  ) : null}
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={pending}
                      onClick={() => onDelete(version)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
