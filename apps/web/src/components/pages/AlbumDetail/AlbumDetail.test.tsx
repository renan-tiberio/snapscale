import { ERROR_CODES, fail, ok } from '@snapscale/shared'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { API_BASE, fixtures } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderApp, seedSession } from '@/test/utils'

const ALBUM_ROUTE = `/albums/${fixtures.album.id}`

function pngFile(name = 'beach.png') {
  return new File(['fake-png-bytes'], name, { type: 'image/png' })
}

function renderAlbum() {
  seedSession()
  return renderApp([ALBUM_ROUTE])
}

describe('AlbumDetail', () => {
  it('shows the album name and its images', async () => {
    renderAlbum()

    expect(await screen.findByRole('heading', { name: 'Holidays' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'sunset.png' })).toHaveAttribute(
      'src',
      `${API_BASE}/images/${fixtures.image.id}/file`,
    )
  })

  it('shows an uploaded image in the grid', async () => {
    const user = userEvent.setup()
    renderAlbum()
    await screen.findByRole('img', { name: 'sunset.png' })

    await user.upload(screen.getByLabelText('Upload image'), pngFile())

    expect(await screen.findByRole('img', { name: 'beach.png' })).toBeInTheDocument()
  })

  it('shows the API error message when the upload is rejected', async () => {
    server.use(
      http.post(`${API_BASE}/images`, () =>
        HttpResponse.json(fail(ERROR_CODES.VALIDATION_ERROR, 'File too large'), { status: 422 }),
      ),
    )
    const user = userEvent.setup()
    renderAlbum()
    await screen.findByRole('img', { name: 'sunset.png' })

    await user.upload(screen.getByLabelText('Upload image'), pngFile('huge.png'))

    expect(await screen.findByRole('alert')).toHaveTextContent('File too large')
  })

  it('processes an image and shows the produced result', async () => {
    const user = userEvent.setup()
    renderAlbum()

    await user.click(await screen.findByRole('button', { name: 'Process sunset.png' }))
    await user.selectOptions(screen.getByLabelText('Size preset'), 'thumbnail')
    await user.selectOptions(screen.getByLabelText('Filter'), 'grayscale')
    await user.click(screen.getByRole('button', { name: 'Process image' }))

    expect(await screen.findByRole('img', { name: 'Processed sunset.png' })).toHaveAttribute(
      'src',
      `${API_BASE}/files/processed/${fixtures.image.id}/grayscale-320x240.jpg`,
    )
  })

  it('shows the API error message when processing fails', async () => {
    server.use(
      http.post(`${API_BASE}/images/process`, () =>
        HttpResponse.json(fail(ERROR_CODES.VALIDATION_ERROR, 'width must be at least 16'), {
          status: 422,
        }),
      ),
    )
    const user = userEvent.setup()
    renderAlbum()

    await user.click(await screen.findByRole('button', { name: 'Process sunset.png' }))
    await user.click(screen.getByRole('button', { name: 'Process image' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('width must be at least 16')
  })

  it('closes the process panel again', async () => {
    const user = userEvent.setup()
    renderAlbum()
    await user.click(await screen.findByRole('button', { name: 'Process sunset.png' }))

    await user.click(screen.getByRole('button', { name: 'Close panel' }))

    expect(screen.queryByRole('button', { name: 'Process image' })).not.toBeInTheDocument()
  })

  it('invites the user to upload the first image of an empty album', async () => {
    server.use(http.get(`${API_BASE}/images`, () => HttpResponse.json(ok([]))))

    renderAlbum()

    expect(await screen.findByText('No images yet — upload your first one.')).toBeInTheDocument()
  })

  it('shows the API error message when the images cannot be loaded', async () => {
    server.use(
      http.get(`${API_BASE}/images`, () =>
        HttpResponse.json(fail(ERROR_CODES.NOT_FOUND, 'Album not found'), { status: 404 }),
      ),
    )

    renderAlbum()

    expect(await screen.findByRole('alert')).toHaveTextContent('Album not found')
  })
})
