import { setupServer } from 'msw/node'

import { handlers } from './handlers'

/** Single msw server for the whole Vitest run — wired in `src/test/setup.ts`. */
export const server = setupServer(...handlers)
