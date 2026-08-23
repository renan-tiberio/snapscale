import type { ButtonProps } from './Button.types'

// RED-stage stub: deliberately does not render a `button` role or wire any
// props, so the behavior specs in Button.test.tsx fail before the real
// implementation lands.
export function Button({ children }: ButtonProps) {
  return <div>{children}</div>
}
