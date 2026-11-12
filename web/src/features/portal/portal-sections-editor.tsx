import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  createPortalId,
  type PortalHomeItem,
  type PortalHomeSection,
} from '@/features/portal/home-content'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

const EMPTY_ITEM: PortalHomeItem = {
  title: '',
  body: '',
  linkText: '',
  linkUrl: '',
  icon: '',
  category: '',
  tags: [],
  showOnHome: false,
}

interface PortalSectionsEditorProps {
  sections: PortalHomeSection[]
  onChange: (sections: PortalHomeSection[]) => void
}

/** Shared AI application section/card editor used by the portal admin pages. */
export function PortalSectionsEditor({ sections, onChange }: PortalSectionsEditorProps) {
  const { t } = useTranslation()

  const updateSection = (sectionId: string, patch: Partial<PortalHomeSection>) => {
    onChange(sections.map((section) => (
      section.id === sectionId ? { ...section, ...patch } : section
    )))
  }

  const updateItem = (sectionId: string, itemIndex: number, patch: Partial<PortalHomeItem>) => {
    onChange(sections.map((section) => section.id === sectionId
      ? {
        ...section,
        items: section.items.map((item, index) => index === itemIndex ? { ...item, ...patch } : item),
      }
      : section))
  }

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    const [section] = next.splice(index, 1)
    next.splice(target, 0, section)
    onChange(next)
  }

  const moveItem = (sectionId: string, index: number, direction: -1 | 1) => {
    onChange(sections.map((section) => {
      if (section.id !== sectionId) return section
      const target = index + direction
      if (target < 0 || target >= section.items.length) return section
      const items = [...section.items]
      const [item] = items.splice(index, 1)
      items.splice(target, 0, item)
      return { ...section, items }
    }))
  }

  const addSection = () => {
    onChange([...sections, {
      id: createPortalId('section'),
      title: t('homeContent.newSection'),
      description: '',
      layout: 'grid',
      items: [],
    }])
  }

  const removeSection = (sectionId: string) => {
    onChange(sections.filter((section) => section.id !== sectionId))
  }

  const addItem = (sectionId: string) => {
    onChange(sections.map((section) => section.id === sectionId
      ? { ...section, items: [...section.items, { ...EMPTY_ITEM }] }
      : section))
  }

  const removeItem = (sectionId: string, itemIndex: number) => {
    onChange(sections.map((section) => section.id === sectionId
      ? { ...section, items: section.items.filter((_, index) => index !== itemIndex) }
      : section))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold font-heading">{t('homeContent.sections')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('homeContent.appsHint')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={addSection}>
          <Plus className="mr-1 h-4 w-4" />
          {t('homeContent.addSection')}
        </Button>
      </div>

      {sections.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{t('homeContent.emptySections')}</Card>
      ) : null}

      {sections.map((section, sectionIndex) => (
        <Card key={section.id} className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`section-title-${section.id}`}>{t('homeContent.sectionTitle')}</Label>
                <Input
                  id={`section-title-${section.id}`}
                  value={section.title}
                  onChange={(event) => updateSection(section.id, { title: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`section-layout-${section.id}`}>{t('homeContent.layout')}</Label>
                <select
                  id={`section-layout-${section.id}`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={section.layout}
                  onChange={(event) => updateSection(section.id, {
                    layout: event.target.value === 'list' ? 'list' : 'grid',
                  })}
                >
                  <option value="grid">{t('homeContent.grid')}</option>
                  <option value="list">{t('homeContent.list')}</option>
                </select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor={`section-description-${section.id}`}>{t('homeContent.sectionDescription')}</Label>
                <Input
                  id={`section-description-${section.id}`}
                  value={section.description}
                  onChange={(event) => updateSection(section.id, { description: event.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" aria-label={t('homeContent.moveUp')} disabled={sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" aria-label={t('homeContent.moveDown')} disabled={sectionIndex === sections.length - 1} onClick={() => moveSection(sectionIndex, 1)}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" aria-label={t('homeContent.remove')} onClick={() => removeSection(section.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {section.items.map((item, itemIndex) => (
              <div key={`${section.id}-${itemIndex}`} className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t('homeContent.item')} {itemIndex + 1}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" aria-label={t('homeContent.moveUp')} disabled={itemIndex === 0} onClick={() => moveItem(section.id, itemIndex, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label={t('homeContent.moveDown')} disabled={itemIndex === section.items.length - 1} onClick={() => moveItem(section.id, itemIndex, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" aria-label={t('homeContent.remove')} onClick={() => removeItem(section.id, itemIndex)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{t('plugin.publish.displayName')}</Label>
                    <Input value={item.title} onChange={(event) => updateItem(section.id, itemIndex, { title: event.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('homeContent.itemIcon')}</Label>
                    <Input value={item.icon} placeholder="🤖" onChange={(event) => updateItem(section.id, itemIndex, { icon: event.target.value })} />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label>{t('plugin.publish.description')}</Label>
                    <Textarea value={item.body} onChange={(event) => updateItem(section.id, itemIndex, { body: event.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('homeContent.itemLinkText')}</Label>
                    <Input value={item.linkText} onChange={(event) => updateItem(section.id, itemIndex, { linkText: event.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('homeContent.itemLinkUrl')}</Label>
                    <Input value={item.linkUrl} placeholder="/search" onChange={(event) => updateItem(section.id, itemIndex, { linkUrl: event.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('plugin.publish.category')}</Label>
                    <Input value={item.category} onChange={(event) => updateItem(section.id, itemIndex, { category: event.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('plugin.publish.tags')}</Label>
                    <Input
                      value={item.tags.join(', ')}
                      onChange={(event) => updateItem(section.id, itemIndex, {
                        tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean),
                      })}
                    />
                  </div>
                  <label className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={item.showOnHome}
                      onChange={(event) => updateItem(section.id, itemIndex, { showOnHome: event.target.checked })}
                    />
                    <span className="font-medium">{t('homeContent.showOnHome')}</span>
                    <span className="text-xs text-muted-foreground">{t('homeContent.showOnHomeHint')}</span>
                  </label>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addItem(section.id)}>
              <Plus className="mr-1 h-4 w-4" />
              {t('homeContent.addItem')}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
