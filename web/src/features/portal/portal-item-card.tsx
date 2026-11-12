import { ArrowRight } from 'lucide-react'
import type { PortalHomeItem } from '@/features/portal/home-content'
import { withBasePath } from '@/shared/lib/base-path'
import { cn } from '@/shared/lib/utils'

export function PortalItemCard({ item, layout }: { item: PortalHomeItem; layout: 'grid' | 'list' }) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg">
        {item.icon || item.title.slice(0, 1).toUpperCase() || '•'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{item.title}</span>
          {item.category ? (
            <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[11px] text-muted-foreground">{item.category}</span>
          ) : null}
        </span>
        {item.body ? <span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.body}</span> : null}
        {item.tags.length ? (
          <span className="mt-2 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span key={tag} className="rounded bg-secondary/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">{tag}</span>
            ))}
          </span>
        ) : null}
        {item.linkText ? (
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
            {item.linkText}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </span>
    </>
  )

  const className = cn(
    'group flex gap-3 transition-colors',
    layout === 'list'
      ? 'p-4 hover:bg-accent/30'
      : 'rounded-xl border border-border/60 bg-card p-5 hover:border-primary/30 hover:bg-accent/30',
  )

  if (!item.linkUrl) {
    return <div className={className}>{content}</div>
  }
  const external = item.linkUrl.startsWith('http://') || item.linkUrl.startsWith('https://')
  return (
    <a
      className={className}
      href={external ? item.linkUrl : withBasePath(item.linkUrl)}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      {content}
    </a>
  )
}
