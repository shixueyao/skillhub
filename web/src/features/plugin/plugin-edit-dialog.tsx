import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DshPluginDetail, DshPluginMetadataInput } from '@/api/dsh-plugins'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

interface DshPluginEditDialogProps {
  plugin: DshPluginDetail
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: DshPluginMetadataInput) => void
}

export function DshPluginEditDialog({
  plugin,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: DshPluginEditDialogProps) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState(plugin.displayName)
  const [summary, setSummary] = useState(plugin.summary)
  const [description, setDescription] = useState(plugin.description)
  const [homepage, setHomepage] = useState(plugin.homepage)
  const [license, setLicense] = useState(plugin.license)
  const [category, setCategory] = useState(plugin.category)
  const [tags, setTags] = useState(plugin.tags.join(', '))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('plugin.manage.editTitle')}</DialogTitle>
          <DialogDescription>{plugin.packageName}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit({
              displayName,
              summary,
              description,
              homepage,
              license,
              category,
              tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
            })
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="dsh-plugin-display-name">{t('plugin.publish.displayName')}</Label>
            <Input
              id="dsh-plugin-display-name"
              value={displayName}
              maxLength={256}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dsh-plugin-summary">{t('plugin.publish.summary')}</Label>
            <Textarea
              id="dsh-plugin-summary"
              value={summary}
              maxLength={2000}
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dsh-plugin-description">{t('plugin.publish.description')}</Label>
            <Textarea
              id="dsh-plugin-description"
              className="min-h-28"
              value={description}
              maxLength={20000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="dsh-plugin-homepage">{t('plugin.publish.homepage')}</Label>
              <Input
                id="dsh-plugin-homepage"
                value={homepage}
                maxLength={512}
                onChange={(event) => setHomepage(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dsh-plugin-license">{t('plugin.publish.license')}</Label>
              <Input
                id="dsh-plugin-license"
                value={license}
                maxLength={64}
                onChange={(event) => setLicense(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dsh-plugin-category">{t('plugin.publish.category')}</Label>
              <Input
                id="dsh-plugin-category"
                value={category}
                maxLength={64}
                onChange={(event) => setCategory(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dsh-plugin-tags">{t('plugin.publish.tags')}</Label>
              <Input
                id="dsh-plugin-tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('plugin.publish.tagsHint')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t('dialog.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('plugin.manage.saving') : t('plugin.manage.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
