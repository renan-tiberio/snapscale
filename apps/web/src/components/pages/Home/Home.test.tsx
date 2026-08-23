import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Home } from './Home'

describe('Home', () => {
  it('lets the user type an email and clear it again', async () => {
    const user = userEvent.setup()
    render(<Home />)

    const input = screen.getByLabelText('Email')
    await user.type(input, 'a@b.com')
    expect(input).toHaveValue('a@b.com')

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(input).toHaveValue('')
  })
})
