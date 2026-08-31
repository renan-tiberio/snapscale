import { OTP_CODE_LENGTH } from '@snapscale/shared'

import type { OtpCodeInputProps } from './OtpCodeInput.types'

import { TextInput } from '@/components/atoms/TextInput'

const NON_DIGITS = /\D/g

export const OtpCodeInput = ({
  value,
  onChange,
  label = 'Verification code',
  disabled = false,
}: OtpCodeInputProps) => (
  <TextInput
    label={label}
    value={value}
    onChange={({ value: next }) =>
      onChange({ value: next.replace(NON_DIGITS, '').slice(0, OTP_CODE_LENGTH) })
    }
    disabled={disabled}
    inputMode="numeric"
    autoComplete="one-time-code"
    maxLength={OTP_CODE_LENGTH}
    placeholder="123456"
    className="text-center text-lg tracking-[0.4em]"
  />
)
