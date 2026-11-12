/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import {
  dshPluginDownloadPath,
  dshPluginDownloadUrl,
  dshPluginInstallCommand,
} from './dsh-plugins'

describe('dsh plugin distribution URLs', () => {
  it('encodes the namespace and slug in the download path', () => {
    expect(dshPluginDownloadPath('@acme', 'hello dsh', '1.2.3')).toBe(
      '/api/web/dsh-plugins/acme/hello%20dsh/versions/1.2.3/download',
    )
  })

  it('builds an absolute install command with the pinned version', () => {
    const command = dshPluginInstallCommand('acme', 'hello-dsh', '1.2.3')

    expect(command).toContain('dsh plugin --profile web add ')
    expect(command).toContain('/api/web/dsh-plugins/acme/hello-dsh/versions/1.2.3/download')
    expect(command).toBe(`dsh plugin --profile web add ${dshPluginDownloadUrl('acme', 'hello-dsh', '1.2.3')}`)
  })
})
