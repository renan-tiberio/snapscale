import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CreateAlbumForm } from './CreateAlbumForm'

describe('CreateAlbumForm', () => {
  it('submits the album name and description the user typed', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<CreateAlbumForm onCreate={onCreate} />)

    await user.type(screen.getByLabelText('Album name'), 'Trip to Porto')
    await user.type(screen.getByLabelText('Description'), 'June 2026')
    await user.click(screen.getByRole('button', { name: 'Create album' }))

    expect(onCreate).toHaveBeenCalledWith({ name: 'Trip to Porto', description: 'June 2026' })
  })

  it('omits an empty description', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<CreateAlbumForm onCreate={onCreate} />)

    await user.type(screen.getByLabelText('Album name'), 'Trip to Porto')
    await user.click(screen.getByRole('button', { name: 'Create album' }))

    expect(onCreate).toHaveBeenCalledWith({ name: 'Trip to Porto' })
  })

  it('clears the form after a submission', async () => {
    const user = userEvent.setup()
    render(<CreateAlbumForm onCreate={() => undefined} />)

    await user.type(screen.getByLabelText('Album name'), 'Trip to Porto')
    await user.click(screen.getByRole('button', { name: 'Create album' }))

    expect(screen.getByLabelText('Album name')).toHaveValue('')
  })

  it('refuses to submit an empty name', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<CreateAlbumForm onCreate={onCreate} />)

    await user.click(screen.getByRole('button', { name: 'Create album' }))

    expect(onCreate).not.toHaveBeenCalled()
  })

  it('refuses to submit again while a creation is in flight', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<CreateAlbumForm onCreate={onCreate} isCreating />)

    await user.type(screen.getByLabelText('Album name'), 'Trip to Porto')
    await user.click(screen.getByRole('button', { name: 'Creating…' }))

    expect(onCreate).not.toHaveBeenCalled()
  })

  it('shows the error message returned by the API', () => {
    render(<CreateAlbumForm onCreate={() => undefined} errorMessage="name is required" />)

    expect(screen.getByRole('alert')).toHaveTextContent('name is required')
  })
})
