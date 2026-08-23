import { ERROR_CODES, fail, ok } from '@snapscale/shared'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { API_BASE, fixtures } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderApp, seedSession } from '@/test/utils'

describe('Albums', () => {
  it('lists the albums of the signed-in user', async () => {
    seedSession()

    renderApp(['/'])

    expect(await screen.findByRole('link', { name: 'Holidays' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument()
  })

  it('shows a created album in the grid', async () => {
    seedSession()
    const user = userEvent.setup()
    renderApp(['/'])
    await screen.findByRole('link', { name: 'Holidays' })

    await user.type(screen.getByLabelText('Album name'), 'Trip to Porto')
    await user.click(screen.getByRole('button', { name: 'Create album' }))

    expect(await screen.findByRole('link', { name: 'Trip to Porto' })).toBeInTheDocument()
  })

  it('drops a deleted album from the grid', async () => {
    seedSession()
    const user = userEvent.setup()
    renderApp(['/'])
    await screen.findByRole('link', { name: 'Holidays' })

    await user.click(screen.getByRole('button', { name: 'Delete Holidays' }))

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Holidays' })).not.toBeInTheDocument()
    })
  })

  it('only disables the album row being deleted, leaving the others enabled', async () => {
    seedSession()
    const user = userEvent.setup()
    server.use(
      http.delete(`${API_BASE}/albums/:id`, async ({ params }) => {
        if (params.id === fixtures.album.id) {
          await delay('infinite')
        }
        return HttpResponse.json(ok({}))
      }),
    )
    renderApp(['/'])
    await screen.findByRole('link', { name: 'Holidays' })

    await user.click(screen.getByRole('button', { name: 'Delete Holidays' }))

    const holidaysButton = await screen.findByRole('button', { name: 'Delete Holidays' })
    expect(holidaysButton).toBeDisabled()
    expect(holidaysButton).toHaveTextContent('Deleting…')

    const workButton = screen.getByRole('button', { name: 'Delete Work' })
    expect(workButton).toBeEnabled()
    expect(workButton).toHaveTextContent('Delete')
  })

  it('opens the album when its card is followed', async () => {
    seedSession()
    const user = userEvent.setup()
    renderApp(['/'])

    await user.click(await screen.findByRole('link', { name: 'Holidays' }))

    expect(await screen.findByRole('heading', { name: 'Holidays' })).toBeInTheDocument()
  })

  it('invites the user to create the first album when there is none', async () => {
    seedSession()
    server.use(http.get(`${API_BASE}/albums`, () => HttpResponse.json(ok([]))))

    renderApp(['/'])

    expect(await screen.findByText('No albums yet — create your first one.')).toBeInTheDocument()
  })

  it('shows the API error message when the albums cannot be loaded', async () => {
    seedSession()
    server.use(
      http.get(`${API_BASE}/albums`, () =>
        HttpResponse.json(fail(ERROR_CODES.INTERNAL, 'Albums unavailable'), { status: 500 }),
      ),
    )

    renderApp(['/'])

    expect(await screen.findByRole('alert')).toHaveTextContent('Albums unavailable')
  })

  it('signs the user out back to the login screen', async () => {
    seedSession()
    const user = userEvent.setup()
    renderApp(['/'])
    await screen.findByRole('link', { name: 'Holidays' })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in to SnapScale' })).toBeInTheDocument()
  })
})
