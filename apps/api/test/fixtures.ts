import sharp from 'sharp'

/**
 * Shared image/multipart fixtures for the `/images/process` and `/files/*`
 * suites. Kept separate from `test/db.ts` (db-only) so new suites reuse this
 * module instead of re-declaring the same buffers.
 */

type Rgb = { r: number; g: number; b: number }

/** Solid-color PNG with distinct R/G/B channel values — good for format/dimension checks. */
export const makeColorPng = ({
  width = 8,
  height = 8,
  background = { r: 200, g: 50, b: 10 },
}: {
  width?: number
  height?: number
  background?: Rgb
} = {}): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer()

/**
 * Two-region PNG — the top half one non-gray color, the bottom half another
 * non-gray color with a different luminance. A *uniform*-color fixture
 * cannot tell "correctly converted to grayscale" apart from "every pixel
 * replaced by the same constant gray value": both produce a uniform output
 * when the input was already uniform. Two differently-lit regions force the
 * two halves to still differ from each other after a *correct* conversion,
 * which a constant-fill bug cannot satisfy.
 */
export const makeTwoToneColorPng = ({
  width = 16,
  height = 16,
  top = { r: 200, g: 50, b: 10 },
  bottom = { r: 10, g: 180, b: 220 },
}: {
  width?: number
  height?: number
  top?: Rgb
  bottom?: Rgb
} = {}): Promise<Buffer> => {
  // Raw pixel buffer for sharp: written by byte offset rather than rebuilt
  // per pixel, which a copy-per-write approach would make O(n^2).
  const data = Buffer.alloc(width * height * 3)
  const half = Math.floor(height / 2)

  for (let y = 0; y < height; y += 1) {
    const color = y < half ? top : bottom
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3
      data[offset] = color.r
      data[offset + 1] = color.g
      data[offset + 2] = color.b
    }
  }

  return sharp(data, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer()
}

/**
 * High-entropy JPEG fixture: random noise compresses very differently at
 * different `quality` levels, unlike a flat-color image whose DCT
 * coefficients are already near zero at any quality — so a "quality
 * affects byte size" assertion is evidence, not coincidence.
 */
export const makeNoiseJpeg = ({
  width = 256,
  height = 256,
  quality = 100,
}: {
  width?: number
  height?: number
  quality?: number
} = {}): Promise<Buffer> => {
  const size = width * height * 3
  const data = Buffer.alloc(size)
  for (let index = 0; index < size; index += 1) {
    data[index] = Math.floor(Math.random() * 256)
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .jpeg({ quality })
    .toBuffer()
}

/** Builds a real multipart/form-data request body using Node/undici globals. */
export const buildMultipartPayload = async ({
  fields,
  file,
}: {
  fields: Record<string, string>
  file?: { field: string; filename: string; contentType: string; data: Buffer }
}): Promise<{ contentType: string; body: Buffer }> => {
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
