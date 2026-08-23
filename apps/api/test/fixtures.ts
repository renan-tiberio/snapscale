import sharp from 'sharp'

/**
 * Shared image/multipart fixtures for the `/images/process` and `/files/*`
 * test suites (docs/03 §4/§7). Kept separate from `test/db.ts` (db-only) and
 * from `routes/images.test.ts`'s own local helpers — new suites reuse this
 * module instead of re-declaring the same buffers.
 */

/** Solid-color PNG with distinct R/G/B channel values — good for format/dimension/grayscale checks. */
export async function makeColorPng(
  width = 8,
  height = 8,
  background: { r: number; g: number; b: number } = { r: 200, g: 50, b: 10 },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } }).png().toBuffer()
}

/**
 * High-entropy JPEG fixture: random noise compresses very differently at
 * different `quality` levels. A flat-color JPEG would not (its DCT
 * coefficients are already near zero at any quality), which would make a
 * "quality affects byte size" assertion pass or fail by coincidence rather
 * than by evidence. This is the "real fixture image" the concurrency smoke
 * test also reuses.
 */
export async function makeNoiseJpeg(width = 256, height = 256, quality = 100): Promise<Buffer> {
  const size = width * height * 3
  const data = Buffer.alloc(size)
  for (let index = 0; index < size; index += 1) {
    data[index] = Math.floor(Math.random() * 256)
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer()
}

/** Builds a real multipart/form-data request body using Node/undici globals — mirrors `routes/images.test.ts`. */
export async function buildMultipartPayload(
  fields: Record<string, string>,
  file?: { field: string; filename: string; contentType: string; data: Buffer },
): Promise<{ contentType: string; body: Buffer }> {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value)
  }
  if (file) {
    form.append(file.field, new Blob([file.data], { type: file.contentType }), file.filename)
  }

  const request = new Request('http://localhost/upload', { method: 'POST', body: form })
  const contentType = request.headers.get('content-type')
  if (!contentType) {
    throw new Error('expected multipart content-type to be set by FormData/Request')
  }

  return { contentType, body: Buffer.from(await request.arrayBuffer()) }
}
