import { ALLOWED_IMAGE_MIME_TYPES } from '@snapscale/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { UploadButton } from './UploadButton'

function pngFile(name = 'beach.png') {
  return new File(['fake-png-bytes'], name, { type: 'image/png' })
}

describe('UploadButton', () => {
  it('renders an accessible file field', () => {
    render(<UploadButton onFileSelected={() => undefined} />)

    expect(screen.getByLabelText('Upload image')).toBeInTheDocument()
  })

  it('reports the file the user picked', async () => {
    const user = userEvent.setup()
    const onFileSelected = vi.fn()
    render(<UploadButton onFileSelected={onFileSelected} />)

    await user.upload(screen.getByLabelText('Upload image'), pngFile())

    expect(onFileSelected).toHaveBeenCalledWith(expect.objectContaining({ name: 'beach.png' }))
  })

  it('only accepts the shared image mime allowlist', () => {
    render(<UploadButton onFileSelected={() => undefined} />)

    expect(screen.getByLabelText('Upload image')).toHaveAttribute(
      'accept',
      ALLOWED_IMAGE_MIME_TYPES.join(','),
    )
  })

  it('refuses new files while an upload is in flight', async () => {
    const user = userEvent.setup()
    const onFileSelected = vi.fn()
    render(<UploadButton onFileSelected={onFileSelected} isUploading />)

    await user.upload(screen.getByLabelText('Upload image'), pngFile())

    expect(onFileSelected).not.toHaveBeenCalled()
  })

  it('tells the user an upload is running', () => {
    render(<UploadButton onFileSelected={() => undefined} isUploading />)

    expect(screen.getByText('Uploading…')).toBeInTheDocument()
  })

  it('uses a caller-provided label', () => {
    render(<UploadButton onFileSelected={() => undefined} label="Add a photo" />)

    expect(screen.getByLabelText('Add a photo')).toBeInTheDocument()
  })
})
