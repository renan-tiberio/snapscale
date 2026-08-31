import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CreateAlbumForm } from './CreateAlbumForm'

import type { CreateAlbumFormProps } from './CreateAlbumForm.types'
import type { UserEvent } from '@testing-library/user-event'

describe('CreateAlbumForm', () => {
  let user: UserEvent
  let onCreate: CreateAlbumFormProps['onCreate']

  beforeEach(() => {
    user = userEvent.setup()
    onCreate = vi.fn()
  })

  it('submits the album name and description the user typed', async () => {
    render(<CreateAlbumForm onCreate={onCreate} />)

    await user.type(screen.getByLabelText('Album name'), 'Trip to Porto')
    await user.type(screen.getByLabelText('Description'), 'June 2026')
    await user.click(screen.getByRole('button', { name: 'Create album' }))

    expect(onCreate).toHaveBeenCalledWith({ name: 'Trip to Porto', description: 'June 2026' })
  })

  it('omits an empty description', async () => {
    render(<CreateAlbumForm onCreate={onCreate} />)

    await user.type(screen.getByLabelText('Album name'), 'Trip to Porto')
    await user.click(screen.getByRole('button', { name: 'Create album' }))

    expect(onCreate).toHaveBeenCalledWith({ name: 'Trip to Porto' })
  })

  it('clears the form after a submission', async () => {
    render(<CreateAlbumForm onCreate={onCreate} />)

    await user.type(screen.getByLabelText('Album name'), 'Trip to Porto')
    await user.click(screen.getByRole('button', { name: 'Create album' }))

    expect(screen.getByLabelText('Album name')).toHaveValue('')
  })

  it('refuses to submit an empty name', async () => {
    render(<CreateAlbumForm onCreate={onCreate} />)

    await user.click(screen.getByRole('button', { name: 'Create album' }))

    expect(onCreate).not.toHaveBeenCalled()
  })

  it('refuses to submit again while a creation is in flight', async () => {
    render(<CreateAlbumForm onCreate={onCreate} isCreating />)

    await user.type(screen.getByLabelText('Album name'), 'Trip to Porto')
    await user.click(screen.getByRole('button', { name: 'Creating…' }))

    expect(onCreate).not.toHaveBeenCalled()
  })

  it('shows the error message returned by the API', () => {
    render(<CreateAlbumForm onCreate={onCreate} errorMessage="name is required" />)

    expect(screen.getByRole('alert')).toHaveTextContent('name is required')
  })
})
