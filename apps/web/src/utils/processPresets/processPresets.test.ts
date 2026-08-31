import { describe, expect, it } from 'vitest'

import { DEFAULT_PROCESS_OPTIONS, findSizePreset, SIZE_PRESETS } from './processPresets'

describe('processPresets', () => {
  it('defaults the quality to the shared contract default', () => {
    expect(DEFAULT_PROCESS_OPTIONS.quality).toBe(80)
  })

  it('defaults to a size that is one of the offered presets', () => {
    expect(
      findSizePreset({
        width: DEFAULT_PROCESS_OPTIONS.width,
        height: DEFAULT_PROCESS_OPTIONS.height,
      }),
    ).toBeDefined()
  })

  it('offers only sizes the contract accepts', () => {
    const withinContractRange = SIZE_PRESETS.every(
      (preset) =>
        preset.width >= 16 && preset.width <= 4096 && preset.height >= 16 && preset.height <= 4096,
    )

    expect(withinContractRange).toBe(true)
  })

  it('finds no preset for a custom size', () => {
    expect(findSizePreset({ width: 123, height: 456 })).toBeUndefined()
  })
})
