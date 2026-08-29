import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ImageCard } from './ImageCard'

import type { ImageCardProps } from './ImageCard.types'

import { fixtures } from '@/test/msw/handlers'

const SRC = `http://localhost:4000/images/${fixtures.image.id}/file`

function renderImageCard(props: Partial<ImageCardProps> = {}) {
  return render(
    <ImageCard image={fixtures.image} src={SRC} onProcess={() => undefined} {...props} />,
  )
}

describe('ImageCard', () => {
  it('renders the image with the filename as its accessible name', () => {
    renderImageCard()

    expect(screen.getByRole('img', { name: 'sunset.png' })).toHaveAttribute('src', SRC)
  })

  it('shows the stored dimensions', () => {
    renderImageCard()

    expect(screen.getByText('1920 × 1080')).toBeInTheDocument()
  })

  it('reports the image id when the process button is pressed', async () => {
    const user = userEvent.setup()
    const onProcess = vi.fn()
    renderImageCard({ onProcess })

    await user.click(screen.getByRole('button', { name: 'Process sunset.png' }))

    expect(onProcess).toHaveBeenCalledWith(fixtures.image.id)
  })

  it('marks the selected image for assistive technology', () => {
    renderImageCard({ isSelected: true })

    expect(screen.getByRole('button', { name: 'Process sunset.png' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('leaves an unselected image unpressed', () => {
    renderImageCard()

    expect(screen.getByRole('button', { name: 'Process sunset.png' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('shows a placeholder instead of an image while no token is available yet', () => {
    renderImageCard({ src: null })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading sunset.png' })).toBeInTheDocument()
  })

  it('shows a retry affordance and notifies the caller when the image fails to load', async () => {
    const user = userEvent.setup()
    const onImageError = vi.fn()
    renderImageCard({ onImageError })

    fireEvent.error(screen.getByRole('img', { name: 'sunset.png' }))

    expect(onImageError).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(onImageError).toHaveBeenCalledTimes(2)
  })
})
