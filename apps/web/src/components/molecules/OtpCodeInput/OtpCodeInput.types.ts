export type OtpCodeInputChange = { value: string }

export type OtpCodeInputProps = {
  /** Current code — always digits only, at most `OTP_CODE_LENGTH` characters. */
  value: string
  onChange: (change: OtpCodeInputChange) => void
  label?: string
  disabled?: boolean
}
