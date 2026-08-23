import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { TextInput } from './TextInput'

function ControlledTextInput() {
  const [value, setValue] = useState('')
  return <TextInput label="Email" value={value} onChange={setValue} />
}

describe('TextInput', () => {
  it('renders with an accessible label', () => {
    render(<TextInput label="Email" value="" onChange={() => undefined} />)

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('reflects the controlled value', () => {
    render(<TextInput label="Email" value="hello@example.com" onChange={() => undefined} />)

    expect(screen.getByLabelText('Email')).toHaveValue('hello@example.com')
  })

  it('calls onChange and updates the controlled value as the user types', async () => {
    const user = userEvent.setup()
    render(<ControlledTextInput />)

    const input = screen.getByLabelText('Email')
    await user.type(input, 'ab')

    expect(input).toHaveValue('ab')
  })

  it('uses a caller-provided id instead of a generated one', () => {
    render(<TextInput label="Email" value="" onChange={() => undefined} id="email-field" />)

    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email-field')
  })

  it('keeps the same input id across a re-render with unchanged props', () => {
    const { rerender } = render(<TextInput label="Email" value="" onChange={() => undefined} />)
    const idBeforeRerender = screen.getByLabelText('Email').id

    rerender(<TextInput label="Email" value="" onChange={() => undefined} />)

    expect(screen.getByLabelText('Email').id).toBe(idBeforeRerender)
  })

  it('picks up a caller-provided className when re-rendered', () => {
    const { rerender } = render(<TextInput label="Email" value="" onChange={() => undefined} />)
    rerender(
      <TextInput label="Email" value="" onChange={() => undefined} className="w-full" />,
    )

    expect(screen.getByLabelText('Email')).toHaveClass('w-full')
  })
})
