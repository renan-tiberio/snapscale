import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { StorageKey } from '@snapscale/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  isWithinUploadDir,
  readUploadedFile,
  resolveUploadPath,
  writeUploadedFile,
} from '@/services/storage/index.js'

describe('storage service — path safety (docs/03 §7)', () => {
  let uploadDir: string

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-storage-'))
  })

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true })
  })

  it('round-trips a written file through readUploadedFile', async () => {
    const data = Buffer.from('hello upload dir')
    const storagePath = new StorageKey('originals/owner/image.png')
    await writeUploadedFile({ uploadDir, storagePath, data })

    const read = await readUploadedFile({ uploadDir, storagePath })

    expect(Buffer.compare(read, data)).toBe(0)
  })

  it('accepts a normal nested storage path as within the upload dir', () => {
    expect(isWithinUploadDir({ uploadDir, storagePath: 'originals/owner-id/image-id.png' })).toBe(
      true,
    )
    expect(isWithinUploadDir({ uploadDir, storagePath: 'processed/image-id/hash.jpg' })).toBe(true)
  })

  it('rejects a `../` traversal attempt that would escape the upload dir', () => {
    expect(isWithinUploadDir({ uploadDir, storagePath: '../../etc/passwd' })).toBe(false)
    expect(isWithinUploadDir({ uploadDir, storagePath: 'originals/../../../etc/passwd' })).toBe(
      false,
    )
  })

  it('rejects a traversal attempt even when it is nested several levels deep', () => {
    expect(
      isWithinUploadDir({ uploadDir, storagePath: 'a/b/c/../../../../../../etc/passwd' }),
    ).toBe(false)
  })

  it('resolveUploadPath joins the upload dir and storage path verbatim (no safety check — callers must check first)', () => {
    expect(resolveUploadPath({ uploadDir, storagePath: new StorageKey('originals/x/y.png') })).toBe(
      join(uploadDir, 'originals/x/y.png'),
    )
  })
})
