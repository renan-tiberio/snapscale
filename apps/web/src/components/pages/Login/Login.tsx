import { OTP_CODE_LENGTH } from '@snapscale/shared'
import { useState } from 'react'
import { Navigate } from 'react-router'

import type { FormEvent } from 'react'

import { Button } from '@/components/atoms/Button'
import { TextInput } from '@/components/atoms/TextInput'
import { OtpCodeInput } from '@/components/molecules/OtpCodeInput'
import { useAuth } from '@/hooks/queries/useAuth'

const MAILHOG_URL = 'http://localhost:8025'

export const Login = () => {
  const {
    isAuthenticated,
    requestOtp,
    isRequestingOtp,
    isOtpRequested,
    requestOtpError,
    verifyOtp,
    isVerifying,
    verifyError,
    resetOtpRequest,
  } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

  const trimmedEmail = email.trim()
  const errorMessage = verifyError?.message ?? requestOtpError?.message ?? null

  const handleEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (trimmedEmail === '' || isRequestingOtp) {
      return
    }

    requestOtp({ email: trimmedEmail })
  }

  const handleCodeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (code.length !== OTP_CODE_LENGTH || isVerifying) {
      return
    }

    verifyOtp({ email: trimmedEmail, code })
  }

  const handleUseAnotherEmail = () => {
    setCode('')
    resetOtpRequest()
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Sign in to SnapScale</h1>

      {isOtpRequested ? (
        <form onSubmit={handleCodeSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            We sent a {OTP_CODE_LENGTH}-digit code to {trimmedEmail}. In local development the email
            lands in MailHog at {MAILHOG_URL}.
          </p>
          <OtpCodeInput
            value={code}
            onChange={({ value }) => setCode(value)}
            disabled={isVerifying}
          />
          <Button type="submit" disabled={code.length !== OTP_CODE_LENGTH || isVerifying}>
            {isVerifying ? 'Verifying…' : 'Verify code'}
          </Button>
          <Button type="button" variant="secondary" onClick={handleUseAnotherEmail}>
            Use another email
          </Button>
        </form>
      ) : (
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Enter your email and we will send you a one-time code.
          </p>
          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={({ value }) => setEmail(value)}
            placeholder="you@example.com"
          />
          <Button type="submit" disabled={trimmedEmail === '' || isRequestingOtp}>
            {isRequestingOtp ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      )}

      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage}
        </p>
      )}
    </main>
  )
}
