import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AlbumCard } from './AlbumCard'

import type { AlbumCardProps } from './AlbumCard.types'
import type { UserEvent } from '@testing-library/user-event'

import { fixtures } from '@/test/msw/handlers'

describe('AlbumCard', () => {
  let user: UserEvent
  let onDelete: AlbumCardProps['onDelete']

  const renderAlbumCard = (props: Partial<AlbumCardProps> = {}) => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <AlbumCard
            album={fixtures.album}
            href={`/albums/${fixtures.album.id}`}
            onDelete={onDelete}
            {...props}
          />
        ),
      },
    ])

    return render(<RouterProvider router={router} />)
  }

  beforeEach(() => {
    user = userEvent.setup()
    onDelete = vi.fn()
  })

  it('links to the album detail route using the album name', () => {
    renderAlbumCard()

    expect(screen.getByRole('link', { name: 'Holidays' })).toHaveAttribute(
      'href',
      `/albums/${fixtures.album.id}`,
    )
  })

  it('shows the album description', () => {
    renderAlbumCard()

    expect(screen.getByText('Beach photos')).toBeInTheDocument()
  })

  it('shows a placeholder when the album has no description', () => {
    renderAlbumCard({ album: { ...fixtures.album, description: null } })

    expect(screen.getByText('No description')).toBeInTheDocument()
  })

  it('reports the album id when the delete button is pressed', async () => {
    renderAlbumCard()

    await user.click(screen.getByRole('button', { name: 'Delete Holidays' }))

    expect(onDelete).toHaveBeenCalledWith({ albumId: fixtures.album.id })
  })

  it('disables deleting while a delete is in flight', async () => {
    renderAlbumCard({ isDeleting: true })

    await user.click(screen.getByRole('button', { name: 'Delete Holidays' }))

    expect(onDelete).not.toHaveBeenCalled()
  })
})
