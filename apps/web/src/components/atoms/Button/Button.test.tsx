import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from './Button'

import type { UserEvent } from '@testing-library/user-event'

describe('Button', () => {
  let user: UserEvent
  let onClick: () => void

  beforeEach(() => {
    user = userEvent.setup()
    onClick = vi.fn()
  })

  it('fires onClick when clicked', async () => {
    render(<Button onClick={onClick}>Save</Button>)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick when disabled', async () => {
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders as disabled when the disabled prop is set', () => {
    render(<Button disabled>Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('applies the secondary variant classes', () => {
    render(<Button variant="secondary">Cancel</Button>)

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('bg-transparent')
  })

  it('merges a caller-provided className with the variant classes', () => {
    render(<Button className="w-full">Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('w-full', 'bg-brand-600')
  })

  it('keeps rendering correctly across a re-render with unchanged props', () => {
    const { rerender } = render(<Button variant="secondary">Save</Button>)
    rerender(<Button variant="secondary">Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-transparent')
  })

  it('switches variant classes when re-rendered with a different variant', () => {
    const { rerender } = render(<Button variant="primary">Save</Button>)
    rerender(<Button variant="secondary">Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-transparent')
  })

  it('picks up a caller-provided className when re-rendered', () => {
    const { rerender } = render(<Button>Save</Button>)
    rerender(<Button className="w-full">Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('w-full')
  })
})
