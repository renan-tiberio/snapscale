import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('lets the user type an email and clear it again', async () => {
    const user = userEvent.setup()
    render(<HomePage />)

    const input = screen.getByLabelText('Email')
    await user.type(input, 'a@b.com')
    expect(input).toHaveValue('a@b.com')

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(input).toHaveValue('')
  })
})
