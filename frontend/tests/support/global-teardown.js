import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'

export default async function globalTeardown(config) {
  const testStorage = config.metadata.careerforgeE2eStorage
  if (!testStorage) return

  const resolvedStorage = resolve(testStorage)
  if (dirname(resolvedStorage) !== resolve(tmpdir()) || !basename(resolvedStorage).startsWith('careerforge-playwright-')) {
    throw new Error('Refusing to remove a path outside the dedicated Playwright temporary directory.')
  }
  rmSync(resolvedStorage, { recursive: true, force: true })
}
