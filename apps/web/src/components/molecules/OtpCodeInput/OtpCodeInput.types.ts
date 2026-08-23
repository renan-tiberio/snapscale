export interface OtpCodeInputProps {
  /** Current code — always digits only, at most 6 characters. */
  value: string
  onChange: (value: string) => void
  label?: string
  disabled?: boolean
}
