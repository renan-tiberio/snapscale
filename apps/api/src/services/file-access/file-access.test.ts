import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AlbumId, Email, ERROR_CODES, ImageId, StorageKey, UserId } from '@snapscale/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as albumsRepo from '@/repositories/albums/index.js'
import * as imagesRepo from '@/repositories/images/index.js'
import * as processedImagesRepo from '@/repositories/processed-images/index.js'
import * as usersRepo from '@/repositories/users/index.js'
import { FileAccessError, resolveOwnedFile } from '@/services/file-access/index.js'
import { ORIGINALS_PREFIX, PROCESSED_PREFIX, writeUploadedFile } from '@/services/storage/index.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

const PNG_MIME_TYPE = 'image/png'
const FIXTURE_BYTES = Buffer.from('not-a-real-png-but-bytes-on-disk')

const uniqueEmail = ({ label }: { label: string }): Email =>
  new Email(`${label}-${randomUUID()}@example.com`)

describe('file-access service', () => {
  let database: TestDatabase
  let uploadDir: string
  let ownerId: UserId
  let intruderId: UserId
  let albumId: AlbumId

  beforeAll(async () => {
    database = await createTestDatabase()
  }, 60_000)

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'snapscale-file-access-'))
    await truncateAll({ handle: database })

    ownerId = new UserId(
      (await usersRepo.upsertByEmail({ db: database.db, email: uniqueEmail({ label: 'owner' }) }))
        .id,
    )
    intruderId = new UserId(
      (
        await usersRepo.upsertByEmail({
          db: database.db,
          email: uniqueEmail({ label: 'intruder' }),
        })
      ).id,
    )
    albumId = new AlbumId((await albumsRepo.create({ db: database.db, ownerId, name: 'Trip' })).id)
  })

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true })
  })

  const storeOriginal = async ({
    owner,
    onDisk = true,
  }: {
    owner: UserId
    onDisk?: boolean
  }): Promise<{ imageId: ImageId; storagePath: StorageKey }> => {
    const imageId = new ImageId(randomUUID())
    const storagePath = new StorageKey(`${ORIGINALS_PREFIX}/${owner.value}/${imageId.value}.png`)
    if (onDisk) {
      await writeUploadedFile({ uploadDir, storagePath, data: FIXTURE_BYTES })
    }
    await imagesRepo.create({
      db: database.db,
      id: imageId,
      albumId,
      ownerId: owner,
      originalFilename: 'fixture.png',
      mimeType: PNG_MIME_TYPE,
      sizeBytes: FIXTURE_BYTES.byteLength,
      storagePath,
    })
    return { imageId, storagePath }
  }

  it('resolves an owned original to its absolute path, mime type and a stat-derived etag', async () => {
    const { storagePath } = await storeOriginal({ owner: ownerId })

    const file = await resolveOwnedFile({
      db: database.db,
      uploadDir,
      storagePath: storagePath.value,
      ownerId,
    })

    expect(file.absolutePath).toBe(join(uploadDir, storagePath.value))
    expect(file.mimeType).toBe(PNG_MIME_TYPE)
    expect(file.etag).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/)
  })

  it('resolves a processed output through its source image, inheriting that mime type', async () => {
    const { imageId } = await storeOriginal({ owner: ownerId })
    const processedPath = new StorageKey(`${PROCESSED_PREFIX}/${ownerId.value}/${randomUUID()}.png`)
    await writeUploadedFile({ uploadDir, storagePath: processedPath, data: FIXTURE_BYTES })
    await processedImagesRepo.create({
      db: database.db,
      imageId,
      paramsHash: 'hash',
      width: 10,
      height: 10,
      filter: 'blur',
      quality: 80,
      storagePath: processedPath,
      durationMs: 1,
    })

    const file = await resolveOwnedFile({
      db: database.db,
      uploadDir,
      storagePath: processedPath.value,
      ownerId,
    })

    expect(file.mimeType).toBe(PNG_MIME_TYPE)
  })

  it('answers a traversal attempt with the same NOT_FOUND error as an unknown path', async () => {
    await expect(
      resolveOwnedFile({
        db: database.db,
        uploadDir,
        storagePath: '../../etc/passwd',
        ownerId,
      }),
    ).rejects.toMatchObject({
      name: 'FileAccessError',
      code: ERROR_CODES.NOT_FOUND,
      message: 'File not found',
    })
  })

  it('rejects a path that no row claims', async () => {
    await expect(
      resolveOwnedFile({
        db: database.db,
        uploadDir,
        storagePath: `${ORIGINALS_PREFIX}/${ownerId.value}/${randomUUID()}.png`,
        ownerId,
      }),
    ).rejects.toBeInstanceOf(FileAccessError)
  })

  it('never becomes an ownership oracle — a foreign blob throws the same NOT_FOUND', async () => {
    const { storagePath: theirs } = await storeOriginal({ owner: intruderId })

    await expect(
      resolveOwnedFile({ db: database.db, uploadDir, storagePath: theirs.value, ownerId }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, message: 'File not found' })
  })

  it('rejects a row whose blob never reached disk, before any 200 header could be sent', async () => {
    const { storagePath } = await storeOriginal({ owner: ownerId, onDisk: false })

    await expect(
      resolveOwnedFile({ db: database.db, uploadDir, storagePath: storagePath.value, ownerId }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND })
  })
})
