import { ERROR_CODES, fail } from '@snapscale/shared'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { API_BASE, VALID_OTP } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderApp, seedSession } from '@/test/utils'

const EMAIL = 'renan@example.com'

async function requestCode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), EMAIL)
  await user.click(screen.getByRole('button', { name: 'Send code' }))
}

describe('Login', () => {
  it('walks the user from email to code to the album list', async () => {
    const user = userEvent.setup()
    renderApp(['/login'])

    await requestCode(user)
    await user.type(await screen.findByLabelText('Verification code'), VALID_OTP)
    await user.click(screen.getByRole('button', { name: 'Verify code' }))

    expect(await screen.findByRole('heading', { name: 'Albums' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Holidays' })).toBeInTheDocument()
  })

  it('tells the user the code arrives in MailHog during local development', async () => {
    const user = userEvent.setup()
    renderApp(['/login'])

    await requestCode(user)

    expect(await screen.findByText(/localhost:8025/)).toBeInTheDocument()
  })

  it('confirms which address the code was sent to', async () => {
    const user = userEvent.setup()
    renderApp(['/login'])

    await requestCode(user)

    expect(await screen.findByText(new RegExp(EMAIL))).toBeInTheDocument()
  })

  it('will not send a code before an email is typed', () => {
    renderApp(['/login'])

    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled()
  })

  it('will not verify a code shorter than six digits', async () => {
    const user = userEvent.setup()
    renderApp(['/login'])
    await requestCode(user)

    await user.type(await screen.findByLabelText('Verification code'), '123')

    expect(screen.getByRole('button', { name: 'Verify code' })).toBeDisabled()
  })

  it('shows the API error message when the code is rejected', async () => {
    const user = userEvent.setup()
    renderApp(['/login'])
    await requestCode(user)

    await user.type(await screen.findByLabelText('Verification code'), '000000')
    await user.click(screen.getByRole('button', { name: 'Verify code' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired code')
  })

  it('shows the API error message when the code cannot be sent', async () => {
    server.use(
      http.post(`${API_BASE}/auth/otp/request`, () =>
        HttpResponse.json(fail(ERROR_CODES.RATE_LIMITED, 'Try again in 60 seconds'), {
          status: 429,
        }),
      ),
    )
    const user = userEvent.setup()
    renderApp(['/login'])

    await requestCode(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 60 seconds')
  })

  it('lets the user go back and use another email address', async () => {
    const user = userEvent.setup()
    renderApp(['/login'])
    await requestCode(user)

    await user.click(await screen.findByRole('button', { name: 'Use another email' }))

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('sends an already-authenticated visitor straight to the album list', async () => {
    seedSession()

    renderApp(['/login'])

    expect(await screen.findByRole('heading', { name: 'Albums' })).toBeInTheDocument()
  })
})
