import type { ButtonProps } from './Button.types'

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary:
    'border border-brand-600 bg-transparent text-brand-600 hover:bg-brand-50 disabled:border-brand-300 disabled:text-brand-300',
}

export function Button({ children, variant = 'primary', className = '', ref, ...props }: ButtonProps) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  )
}
