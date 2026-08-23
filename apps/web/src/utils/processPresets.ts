import { imageProcessOptionsSchema } from '@snapscale/shared'

import type { ImageProcessOptions } from '@snapscale/shared'

export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
}

const WEB_PRESET: SizePreset = { id: 'web', label: 'Web — 1280×720', width: 1280, height: 720 }

/** Ready-made output sizes offered by the process panel. */
export const SIZE_PRESETS: SizePreset[] = [
  { id: 'thumbnail', label: 'Thumbnail — 320×240', width: 320, height: 240 },
  WEB_PRESET,
  { id: 'fullhd', label: 'Full HD — 1920×1080', width: 1920, height: 1080 },
]

/**
 * Panel defaults. `quality` is not hardcoded: it comes from the shared zod
 * schema default, so the contract stays the single source of truth.
 */
export const DEFAULT_PROCESS_OPTIONS: ImageProcessOptions = {
  width: WEB_PRESET.width,
  height: WEB_PRESET.height,
  filter: 'none',
  quality: imageProcessOptionsSchema.shape.quality.parse(undefined),
}

/** Finds the preset matching an exact width/height pair, if any. */
export function findSizePreset(width: number, height: number): SizePreset | undefined {
  return SIZE_PRESETS.find((preset) => preset.width === width && preset.height === height)
}
