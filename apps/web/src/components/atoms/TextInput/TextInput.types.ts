import type { InputHTMLAttributes } from 'react'

export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label: string
  value: string
  onChange: (value: string) => void
}
