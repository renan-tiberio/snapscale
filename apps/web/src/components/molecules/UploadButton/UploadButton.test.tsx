import { ALLOWED_IMAGE_MIME_TYPES } from '@snapscale/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UploadButton } from './UploadButton'

import type { UploadButtonProps } from './UploadButton.types'
import type { UserEvent } from '@testing-library/user-event'

const pngFile = ({ name = 'beach.png' }: { name?: string } = {}) =>
  new File(['fake-png-bytes'], name, { type: 'image/png' })

describe('UploadButton', () => {
  let user: UserEvent
  let onFileSelected: UploadButtonProps['onFileSelected']

  const renderUploadButton = (props: Partial<UploadButtonProps> = {}) =>
    render(<UploadButton onFileSelected={onFileSelected} {...props} />)

  beforeEach(() => {
    user = userEvent.setup()
    onFileSelected = vi.fn()
  })

  it('renders an accessible file field', () => {
    renderUploadButton()

    expect(screen.getByLabelText('Upload image')).toBeInTheDocument()
  })

  it('reports the file the user picked', async () => {
    renderUploadButton()

    await user.upload(screen.getByLabelText('Upload image'), pngFile())

    expect(onFileSelected).toHaveBeenCalledWith({
      file: expect.objectContaining({ name: 'beach.png' }),
    })
  })

  it('only accepts the shared image mime allowlist', () => {
    renderUploadButton()

    expect(screen.getByLabelText('Upload image')).toHaveAttribute(
      'accept',
      ALLOWED_IMAGE_MIME_TYPES.join(','),
    )
  })

  it('refuses new files while an upload is in flight', async () => {
    renderUploadButton({ isUploading: true })

    await user.upload(screen.getByLabelText('Upload image'), pngFile())

    expect(onFileSelected).not.toHaveBeenCalled()
  })

  it('tells the user an upload is running', () => {
    renderUploadButton({ isUploading: true })

    expect(screen.getByText('Uploading…')).toBeInTheDocument()
  })

  it('uses a caller-provided label', () => {
    renderUploadButton({ label: 'Add a photo' })

    expect(screen.getByLabelText('Add a photo')).toBeInTheDocument()
  })
})
