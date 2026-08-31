/**
 * The three origins the journey talks to, each overridable by environment
 * variable and each defaulting to the local stack documented in `README.md`
 * ("Where each service lives").
 *
 * Read by `playwright.config.ts` (for `use.baseURL`) and by the specs, so the
 * config and the tests can never disagree about where the stack is.
 */

/** Vite dev server / built web app — the `baseURL` every `page.goto` is relative to. */
export const WEB_BASE_URL: string = process.env.E2E_WEB_URL ?? 'http://localhost:5173'

/** Fastify api. The web app talks to it directly (`VITE_API_URL`), so specs can too. */
export const API_BASE_URL: string = process.env.E2E_API_URL ?? 'http://localhost:4000'

/** MailHog's HTTP API — where every OTP email lands locally. */
export const MAILHOG_BASE_URL: string = process.env.E2E_MAILHOG_URL ?? 'http://localhost:8025'
