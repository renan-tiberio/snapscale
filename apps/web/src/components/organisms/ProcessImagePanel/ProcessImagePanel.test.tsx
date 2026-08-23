import { IMAGE_FILTERS } from '@snapscale/shared'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'


import { ProcessImagePanel } from './ProcessImagePanel'

import type { ProcessImagePanelProps } from './ProcessImagePanel.types'

import { DEFAULT_PROCESS_OPTIONS } from '@/utils/processPresets'

function renderPanel(props: Partial<ProcessImagePanelProps> = {}) {
  return render(
    <ProcessImagePanel
      imageName="sunset.png"
      onProcess={() => undefined}
      onClose={() => undefined}
      {...props}
    />,
  )
}

describe('ProcessImagePanel', () => {
  it('names the image being processed', () => {
    renderPanel()

    expect(screen.getByRole('heading', { name: 'Process sunset.png' })).toBeInTheDocument()
  })

  it('offers every filter from the shared contract', () => {
    renderPanel()

    const filterOptions = screen
      .getAllByRole('option')
      .map((option) => option.getAttribute('value'))

    expect(IMAGE_FILTERS.every((filter) => filterOptions.includes(filter))).toBe(true)
  })

  it('submits the contract defaults when nothing is changed', async () => {
    const user = userEvent.setup()
    const onProcess = vi.fn()
    renderPanel({ onProcess })

    await user.click(screen.getByRole('button', { name: 'Process image' }))

    expect(onProcess).toHaveBeenCalledWith(DEFAULT_PROCESS_OPTIONS)
  })

  it('submits the size chosen from the preset picker', async () => {
    const user = userEvent.setup()
    const onProcess = vi.fn()
    renderPanel({ onProcess })

    await user.selectOptions(screen.getByLabelText('Size preset'), 'thumbnail')
    await user.click(screen.getByRole('button', { name: 'Process image' }))

    expect(onProcess).toHaveBeenCalledWith({
      ...DEFAULT_PROCESS_OPTIONS,
      width: 320,
      height: 240,
    })
  })

  it('submits the filter and quality the user picked', async () => {
    const user = userEvent.setup()
    const onProcess = vi.fn()
    renderPanel({ onProcess })

    await user.selectOptions(screen.getByLabelText('Filter'), 'blur')
    await user.clear(screen.getByLabelText('Quality'))
    await user.type(screen.getByLabelText('Quality'), '55')
    await user.click(screen.getByRole('button', { name: 'Process image' }))

    expect(onProcess).toHaveBeenCalledWith({
      ...DEFAULT_PROCESS_OPTIONS,
      filter: 'blur',
      quality: 55,
    })
  })

  it('submits a custom width and height', async () => {
    const user = userEvent.setup()
    const onProcess = vi.fn()
    renderPanel({ onProcess })

    await user.clear(screen.getByLabelText('Width'))
    await user.type(screen.getByLabelText('Width'), '640')
    await user.clear(screen.getByLabelText('Height'))
    await user.type(screen.getByLabelText('Height'), '480')
    await user.click(screen.getByRole('button', { name: 'Process image' }))

    expect(onProcess).toHaveBeenCalledWith({
      ...DEFAULT_PROCESS_OPTIONS,
      width: 640,
      height: 480,
    })
  })

  it('does not submit again while processing is running', async () => {
    const user = userEvent.setup()
    const onProcess = vi.fn()
    renderPanel({ onProcess, isProcessing: true })

    await user.click(screen.getByRole('button', { name: 'Processing…' }))

    expect(onProcess).not.toHaveBeenCalled()
  })

  it('shows the processed result once it is available', () => {
    renderPanel({ resultUrl: 'http://localhost:4000/files/processed/img/abc.jpg' })

    expect(screen.getByRole('img', { name: 'Processed sunset.png' })).toHaveAttribute(
      'src',
      'http://localhost:4000/files/processed/img/abc.jpg',
    )
  })

  it('shows no result image before the first run', () => {
    renderPanel()

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the error code message returned by the API', () => {
    renderPanel({ errorMessage: 'width must be at least 16' })

    expect(screen.getByRole('alert')).toHaveTextContent('width must be at least 16')
  })

  it('closes when the user dismisses the panel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderPanel({ onClose })

    await user.click(screen.getByRole('button', { name: 'Close panel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a retry affordance and notifies the caller when the processed image fails to load', async () => {
    const user = userEvent.setup()
    const onImageError = vi.fn()
    renderPanel({ resultUrl: 'http://localhost:4000/files/processed/img/abc.jpg', onImageError })

    fireEvent.error(screen.getByRole('img', { name: 'Processed sunset.png' }))

    expect(onImageError).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(onImageError).toHaveBeenCalledTimes(2)
  })
})
