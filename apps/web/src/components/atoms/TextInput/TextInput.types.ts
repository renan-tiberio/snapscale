import type { InputHTMLAttributes } from 'react'

export type TextInputChange = { value: string }

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  label: string
  value: string
  onChange: (change: TextInputChange) => void
}
