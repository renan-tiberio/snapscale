import type { TextInputProps } from './TextInput.types'

// RED-stage stub: renders the label text without an accessible form control,
// so the specs in TextInput.test.tsx fail before the real implementation
// lands.
export function TextInput({ label }: TextInputProps) {
  return <div>{label}</div>
}
