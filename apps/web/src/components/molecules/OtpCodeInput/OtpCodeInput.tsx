import type { OtpCodeInputProps } from './OtpCodeInput.types'

import { TextInput } from '@/components/atoms/TextInput'

const OTP_LENGTH = 6
const NON_DIGITS = /\D/g

export function OtpCodeInput({
  value,
  onChange,
  label = 'Verification code',
  disabled = false,
}: OtpCodeInputProps) {
  return (
    <TextInput
      label={label}
      value={value}
      onChange={(next) => onChange(next.replace(NON_DIGITS, '').slice(0, OTP_LENGTH))}
      disabled={disabled}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={OTP_LENGTH}
      placeholder="123456"
      className="text-center text-lg tracking-[0.4em]"
    />
  )
}
