import { useId } from 'react'

import type { TextInputProps } from './TextInput.types'

export function TextInput({ label, value, onChange, id, className = '', ...props }: TextInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 ${className}`.trim()}
        {...props}
      />
    </div>
  )
}
