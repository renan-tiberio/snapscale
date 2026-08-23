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
    render(<TextInput label="Email" value="" onChange={() => {}} />)

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('reflects the controlled value', () => {
    render(<TextInput label="Email" value="hello@example.com" onChange={() => {}} />)

    expect(screen.getByLabelText('Email')).toHaveValue('hello@example.com')
  })

  it('calls onChange and updates the controlled value as the user types', async () => {
    const user = userEvent.setup()
    render(<ControlledTextInput />)

    const input = screen.getByLabelText('Email')
    await user.type(input, 'ab')

    expect(input).toHaveValue('ab')
  })
})
