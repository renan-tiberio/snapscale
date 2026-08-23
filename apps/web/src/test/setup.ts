import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'

import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, beforeAll } from 'vitest'

import { resetApiState } from './msw/handlers'
import { server } from './msw/server'

import { clear as clearStorage } from '@/services/storage'

// jsdom ships its own `FormData`/`File`/`Blob`, but `fetch`/`Request` in this
// environment come from Node. Handing a jsdom FormData to Node's fetch does not
// throw — it silently serializes to the string "[object FormData]", so a
// multipart upload would reach msw as `text/plain`. Aligning the body types on
// Node's implementations makes an upload in tests look exactly like it does in
// a real browser, where both sides share one realm.
const formDataProbe = await new Response('probe=1', {
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
}).formData()

globalThis.FormData = formDataProbe.constructor as typeof FormData
globalThis.Blob = NodeBlob as unknown as typeof Blob
globalThis.File = NodeFile as unknown as typeof File

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
  resetApiState()
  clearStorage()
})

afterAll(() => {
  server.close()
})
