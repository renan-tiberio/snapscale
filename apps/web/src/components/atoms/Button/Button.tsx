import { tv } from 'tailwind-variants'

import type { ButtonProps } from './Button.types'

const button = tv({
  base: 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
  variants: {
    variant: {
      primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
      secondary:
        'border border-brand-600 bg-transparent text-brand-600 hover:bg-brand-50 disabled:border-brand-300 disabled:text-brand-300',
    },
  },
  defaultVariants: {
    variant: 'primary',
  },
})

export const Button = ({ children, variant, className, ref, ...props }: ButtonProps) => (
  <button ref={ref} className={button({ variant, className })} {...props}>
    {children}
  </button>
)
