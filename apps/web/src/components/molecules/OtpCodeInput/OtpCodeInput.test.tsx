import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { OtpCodeInput } from './OtpCodeInput'

import type { UserEvent } from '@testing-library/user-event'

const ControlledOtpCodeInput = ({ disabled = false }: { disabled?: boolean }) => {
  const [value, setValue] = useState('')
  return (
    <OtpCodeInput
      value={value}
      onChange={({ value: next }) => setValue(next)}
      disabled={disabled}
    />
  )
}

describe('OtpCodeInput', () => {
  let user: UserEvent

  beforeEach(() => {
    user = userEvent.setup()
  })

  it('renders an accessible field labelled as the verification code', () => {
    render(<OtpCodeInput value="" onChange={() => undefined} />)

    expect(screen.getByLabelText('Verification code')).toBeInTheDocument()
  })

  it('accepts the six digits the user types', async () => {
    render(<ControlledOtpCodeInput />)

    await user.type(screen.getByLabelText('Verification code'), '123456')

    expect(screen.getByLabelText('Verification code')).toHaveValue('123456')
  })

  it('ignores non-digit characters', async () => {
    render(<ControlledOtpCodeInput />)

    await user.type(screen.getByLabelText('Verification code'), '12ab34')

    expect(screen.getByLabelText('Verification code')).toHaveValue('1234')
  })

  it('stops accepting input after six digits', async () => {
    render(<ControlledOtpCodeInput />)

    await user.type(screen.getByLabelText('Verification code'), '1234567890')

    expect(screen.getByLabelText('Verification code')).toHaveValue('123456')
  })

  it('does not accept input while disabled', async () => {
    render(<ControlledOtpCodeInput disabled />)

    await user.type(screen.getByLabelText('Verification code'), '123456')

    expect(screen.getByLabelText('Verification code')).toHaveValue('')
  })

  it('uses a caller-provided label', () => {
    render(<OtpCodeInput value="" onChange={() => undefined} label="One-time code" />)

    expect(screen.getByLabelText('One-time code')).toBeInTheDocument()
  })
})
