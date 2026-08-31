import { useId } from 'react'
import { tv } from 'tailwind-variants'

import type { TextInputProps } from './TextInput.types'

const input = tv({
  base: 'focus:border-brand-500 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100',
})

export const TextInput = ({ label, value, onChange, id, className, ...props }: TextInputProps) => {
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
        onChange={(event) => onChange({ value: event.target.value })}
        className={input({ className })}
        {...props}
      />
    </div>
  )
}
