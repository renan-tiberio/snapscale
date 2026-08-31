import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { purgeInbox, uniqueEmail, waitForOtpCode } from '../src/mailhog.js'

import type { Locator, Page, Response } from '@playwright/test'

/** The committed fixture: a real 512×384 RGB PNG (`e2e/fixtures/`). */
const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/gallery-sample.png', import.meta.url))
const FIXTURE_NAME = 'gallery-sample.png'

/**
 * Processing parameters, all inside the shared contract
 * (`packages/shared/src/schemas/process.ts`): width/height 16–4096,
 * filter one of none|grayscale|blur|sharpen, quality 1–100.
 *
 * 320×240 is deliberately the same 4:3 aspect ratio as the fixture, so sharp's
 * `fit: 'inside'` resize lands on exactly those dimensions and the decoded
 * output can be asserted pixel-for-pixel rather than "smaller than before".
 */
const PROCESS_WIDTH = 320
const PROCESS_HEIGHT = 240
const PROCESS_FILTER = 'grayscale'
const PROCESS_QUALITY = 70

/**
 * The decode-relevant slice of a real `<img>`. Named locally because e2e's
 * tsconfig carries no DOM lib — Playwright still runs this callback in the
 * actual browser, only the type-checking is local.
 */
type DecodableImage = {
  decode: () => Promise<void>
  naturalWidth: number
  naturalHeight: number
}

/** The one `Window` property this journey reads back — see `DecodableImage`. */
type BrowserSessionStorage = {
  localStorage: { getItem: (key: string) => string | null }
}

/** Fills the email field and waits for the code-entry screen to appear. */
const requestOtp = async ({ page, email }: { page: Page; email: string }): Promise<void> => {
  // eslint-disable-next-line no-restricted-syntax -- Playwright Locator.fill() fills a form field; unrelated to Array.prototype.fill.
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page.getByLabel('Verification code')).toBeVisible()
}

/** Signs in through the UI, reading the code out of MailHog like a human would. */
const signIn = async ({ page, code }: { page: Page; code: string }): Promise<void> => {
  // eslint-disable-next-line no-restricted-syntax -- Playwright Locator.fill() fills a form field; unrelated to Array.prototype.fill.
  await page.getByLabel('Verification code').fill(code)
  await page.getByRole('button', { name: 'Verify code' }).click()
}

/** Natural (decoded) size of a rendered `<img>` — 0×0 while it is still broken. */
const decodedSize = async ({
  locator,
}: {
  locator: Locator
}): Promise<{ width: number; height: number }> => {
  await locator.evaluate((element) => (element as unknown as DecodableImage).decode())

  return locator.evaluate((element) => ({
    width: (element as unknown as DecodableImage).naturalWidth,
    height: (element as unknown as DecodableImage).naturalHeight,
  }))
}

/** Turns a 6-digit code into a different 6-digit code, digit by digit. */
const shiftEveryDigit = ({ code }: { code: string }): string => {
  const DIGIT_MODULUS = 10

  return [...code].map((digit) => String((Number(digit) + 1) % DIGIT_MODULUS)).join('')
}

test.beforeEach(async ({ request }) => {
  await purgeInbox({ request })
})

test('full gallery journey: OTP sign-in, album, upload, process, rendered result', async ({
  page,
}) => {
  const email = uniqueEmail()
  const albumName = `Journey album ${String(Date.now())}`

  // ---- 1. Request an OTP -------------------------------------------------
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in to SnapScale' })).toBeVisible()
  await requestOtp({ page, email })

  // ---- 2. Read the code out of MailHog and land authenticated ------------
  const code = await waitForOtpCode({ request: page.request, email })
  expect(code, 'MailHog should hold a 6-digit code for this run').toMatch(/^\d{6}$/)

  await signIn({ page, code })

  await expect(page.getByRole('heading', { name: 'Albums', level: 1 })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  await expect(page).toHaveURL(/\/$/)

  // ---- 3. Create an album and open it ------------------------------------
  // eslint-disable-next-line no-restricted-syntax -- Playwright Locator.fill() fills a form field; unrelated to Array.prototype.fill.
  await page.getByLabel('Album name').fill(albumName)
  // eslint-disable-next-line no-restricted-syntax -- Playwright Locator.fill() fills a form field; unrelated to Array.prototype.fill.
  await page.getByLabel('Description').fill('Created by the phase-1 E2E journey')
  await page.getByRole('button', { name: 'Create album' }).click()

  const albumLink = page.getByRole('link', { name: albumName })
  await expect(albumLink).toBeVisible()
  await albumLink.click()

  await expect(page.getByRole('heading', { name: albumName, level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\/albums\/[0-9a-f-]{36}$/)

  // ---- 4. Upload the fixture and see it in the grid ----------------------
  await expect(page.getByText('No images yet — upload your first one.')).toBeVisible()
  await page.getByLabel('Upload image').setInputFiles(FIXTURE_PATH)

  const gridImage = page.getByRole('img', { name: FIXTURE_NAME })
  await expect(gridImage).toBeVisible()
  // The card prints the dimensions the api read off the uploaded bytes: proof
  // the file reached storage and was decoded, not just that a row was created.
  await expect(page.getByText('512 × 384')).toBeVisible()
  await expect(decodedSize({ locator: gridImage })).resolves.toEqual({ width: 512, height: 384 })

  // ---- 5. Process it -----------------------------------------------------
  // Collect every /files/ response the browser itself makes, so the processed
  // image's status is proven from the real page load, not only from a
  // side-channel request.
  let fileResponses: readonly Response[] = []
  page.on('response', (response) => {
    if (response.url().includes('/files/')) {
      fileResponses = [...fileResponses, response]
    }
  })

  await page.getByRole('button', { name: `Process ${FIXTURE_NAME}` }).click()
  await expect(page.getByRole('heading', { name: `Process ${FIXTURE_NAME}` })).toBeVisible()

  // eslint-disable-next-line no-restricted-syntax -- Playwright Locator.fill() fills a form field; unrelated to Array.prototype.fill.
  await page.getByLabel('Width', { exact: true }).fill(String(PROCESS_WIDTH))
  // eslint-disable-next-line no-restricted-syntax -- Playwright Locator.fill() fills a form field; unrelated to Array.prototype.fill.
  await page.getByLabel('Height', { exact: true }).fill(String(PROCESS_HEIGHT))
  await page.getByLabel('Filter', { exact: true }).selectOption(PROCESS_FILTER)
  // eslint-disable-next-line no-restricted-syntax -- Playwright Locator.fill() fills a form field; unrelated to Array.prototype.fill.
  await page.getByLabel('Quality', { exact: true }).fill(String(PROCESS_QUALITY))
  await page.getByRole('button', { name: 'Process image' }).click()

  // ---- 6. The processed result renders, and its bytes really are served ---
  const resultImage = page.getByRole('img', { name: `Processed ${FIXTURE_NAME}` })
  await expect(resultImage).toBeVisible()

  const resultSrc = await resultImage.getAttribute('src')
  expect(resultSrc, 'the processed <img> must have a src').not.toBeNull()
  expect(resultSrc).toContain(`/files/processed/`)

  // (a) status asserted from a real HTTP call against the resolved src
  const resultResponse = await page.request.get(resultSrc as string)
  expect(resultResponse.status(), `GET ${resultSrc as string} should be 200`).toBe(200)
  expect(resultResponse.headers()['content-type']).toContain('image/png')
  expect((await resultResponse.body()).byteLength).toBeGreaterThan(0)

  // (b) status asserted from the browser's own load of that same URL
  await expect
    .poll(() => fileResponses.some((response) => response.url() === resultSrc && response.ok()), {
      message: 'the browser should have fetched the processed image with a 2xx',
    })
    .toBe(true)
  const browserResponse = fileResponses.find((response) => response.url() === resultSrc)
  expect(browserResponse?.status(), 'browser-side status for the processed image').toBe(200)

  // (c) the pixels the browser decoded are the ones that were asked for
  await expect(decodedSize({ locator: resultImage })).resolves.toEqual({
    width: PROCESS_WIDTH,
    height: PROCESS_HEIGHT,
  })
})

test('an invalid OTP code shows an error and does not authenticate', async ({ page }) => {
  const email = uniqueEmail({ prefix: 'invalid-otp' })

  await page.goto('/login')
  await requestOtp({ page, email })

  // Derive a code that is guaranteed *not* the real one instead of guessing a
  // constant: a hardcoded "000000" would pass this test for the wrong reason
  // roughly once every million runs.
  const realCode = await waitForOtpCode({ request: page.request, email })
  const wrongCode = shiftEveryDigit({ code: realCode })
  expect(wrongCode).not.toBe(realCode)

  await signIn({ page, code: wrongCode })

  await expect(page.getByRole('alert')).toHaveText('Invalid or expired code')
  // Not authenticated: still on the login screen, no gallery, no session.
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Albums', level: 1 })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Verify code' })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() =>
        (globalThis as unknown as BrowserSessionStorage).localStorage.getItem('snapscale.session'),
      ),
    )
    .toBeNull()

  // And the guard holds on a direct navigation, not just on this screen.
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})
