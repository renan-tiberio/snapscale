import { ERROR_CODES, fail, ok } from '@snapscale/shared'
import { http, HttpResponse } from 'msw'

import type { Album, Image, ProcessedImage, User } from '@snapscale/shared'

/**
 * msw handlers implementing the phase-1 API surface of
 * `docs/03-technical-design.md` §4 — every response uses the shared envelope.
 * The state is mutable so mutation + invalidation is observable in the UI:
 * creating an album and refetching the list must show the new row.
 */
export const API_BASE = 'http://localhost:4000'

export const TEST_TOKEN = 'test-session-token'
/** The `scope: 'file'` token `GET /auth/file-token` hands back — see `hooks/queries/useFileToken.ts`. */
export const TEST_FILE_TOKEN = 'test-file-token'
export const VALID_OTP = '123456'

export const testUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'renan@example.com',
  createdAt: '2026-08-01T10:00:00.000Z',
}

const albumFixture: Album = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  userId: testUser.id,
  name: 'Holidays',
  description: 'Beach photos',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
}

const secondAlbumFixture: Album = {
  id: 'aaaaaaaa-2222-4222-8222-222222222222',
  userId: testUser.id,
  name: 'Work',
  description: null,
  createdAt: '2026-08-02T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
}

const imageFixture: Image = {
  id: 'bbbbbbbb-1111-4111-8111-111111111111',
  albumId: albumFixture.id,
  ownerId: testUser.id,
  originalFilename: 'sunset.png',
  storagePath: `originals/${testUser.id}/bbbbbbbb-1111-4111-8111-111111111111.png`,
  mimeType: 'image/png',
  sizeBytes: 2048,
  width: 1920,
  height: 1080,
  createdAt: '2026-08-03T10:00:00.000Z',
  updatedAt: '2026-08-03T10:00:00.000Z',
}

export const fixtures = {
  album: albumFixture,
  secondAlbum: secondAlbumFixture,
  image: imageFixture,
}

interface ApiState {
  albums: Album[]
  images: Image[]
}

let state: ApiState = { albums: [], images: [] }

export function resetApiState(): void {
  state = {
    albums: [{ ...albumFixture }, { ...secondAlbumFixture }],
    images: [{ ...imageFixture }],
  }
}

resetApiState()

let sequence = 0

function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}${String(sequence).padStart(4, '0')}-4111-8111-111111111111`
}

export const handlers = [
  http.post(`${API_BASE}/auth/otp/request`, () => HttpResponse.json(ok({ requested: true }))),

  http.post(`${API_BASE}/auth/otp/verify`, async ({ request }) => {
    const body = (await request.json()) as { email: string; code: string }

    if (body.code !== VALID_OTP) {
      return HttpResponse.json(
        fail(ERROR_CODES.UNAUTHORIZED, 'Invalid or expired code'),
        { status: 401 },
      )
    }

    return HttpResponse.json(ok({ token: TEST_TOKEN, user: { ...testUser, email: body.email } }))
  }),

  http.get(`${API_BASE}/auth/file-token`, () => HttpResponse.json(ok({ token: TEST_FILE_TOKEN }))),

  http.get(`${API_BASE}/albums`, () =>
    HttpResponse.json(
      ok(state.albums, { total: state.albums.length, page: 1, limit: 20 }),
    ),
  ),

  http.post(`${API_BASE}/albums`, async ({ request }) => {
    const body = (await request.json()) as { name: string; description?: string }
    const album: Album = {
      id: nextId('cccccccc-'),
      userId: testUser.id,
      name: body.name,
      description: body.description ?? null,
      createdAt: '2026-08-10T10:00:00.000Z',
      updatedAt: '2026-08-10T10:00:00.000Z',
    }
    state.albums = [...state.albums, album]

    return HttpResponse.json(ok(album), { status: 201 })
  }),

  http.patch(`${API_BASE}/albums/:id`, async ({ params, request }) => {
    const body = (await request.json()) as { name?: string; description?: string }
    const existing = state.albums.find((album) => album.id === params.id)

    if (!existing) {
      return HttpResponse.json(fail(ERROR_CODES.NOT_FOUND, 'Album not found'), { status: 404 })
    }

    const updated: Album = { ...existing, ...body }
    state.albums = state.albums.map((album) => (album.id === updated.id ? updated : album))

    return HttpResponse.json(ok(updated))
  }),

  http.delete(`${API_BASE}/albums/:id`, ({ params }) => {
    state.albums = state.albums.filter((album) => album.id !== params.id)

    return HttpResponse.json(ok({}))
  }),

  http.get(`${API_BASE}/images`, ({ request }) => {
    const albumId = new URL(request.url).searchParams.get('albumId')
    const images = state.images.filter((image) => image.albumId === albumId)

    return HttpResponse.json(ok(images, { total: images.length, page: 1, limit: 20 }))
  }),

  http.post(`${API_BASE}/images`, async ({ request }) => {
    const form = await request.formData()
    const file = form.get('file') as File | null
    const albumId = String(form.get('albumId'))

    if (!file) {
      return HttpResponse.json(fail(ERROR_CODES.VALIDATION_ERROR, 'file is required'), {
        status: 422,
      })
    }

    const image: Image = {
      id: nextId('dddddddd-'),
      albumId,
      ownerId: testUser.id,
      originalFilename: file.name,
      storagePath: `originals/${testUser.id}/${file.name}`,
      mimeType: 'image/png',
      sizeBytes: Math.max(file.size, 1),
      width: 800,
      height: 600,
      createdAt: '2026-08-11T10:00:00.000Z',
      updatedAt: '2026-08-11T10:00:00.000Z',
    }
    state.images = [...state.images, image]

    return HttpResponse.json(ok(image), { status: 201 })
  }),

  http.post(`${API_BASE}/images/process`, async ({ request }) => {
    const body = (await request.json()) as {
      imageId: string
      width: number
      height: number
      filter: ProcessedImage['params']['filter']
      quality: number
    }

    const processed: ProcessedImage = {
      id: nextId('eeeeeeee-'),
      imageId: body.imageId,
      params: {
        width: body.width,
        height: body.height,
        filter: body.filter,
        quality: body.quality,
      },
      storagePath: `processed/${body.imageId}/${body.filter}-${body.width}x${body.height}.jpg`,
      durationMs: 42,
      createdAt: '2026-08-12T10:00:00.000Z',
    }

    return HttpResponse.json(ok(processed))
  }),
]
