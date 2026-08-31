import {
  IMAGE_FILTERS,
  MAX_PROCESS_DIMENSION_PX,
  MAX_PROCESS_QUALITY,
  MIN_PROCESS_DIMENSION_PX,
  MIN_PROCESS_QUALITY,
} from '@snapscale/shared'
import { useId, useState } from 'react'
import { tv } from 'tailwind-variants'

import type { ProcessImagePanelProps } from './ProcessImagePanel.types'
import type { ImageFilter } from '@snapscale/shared'
import type { FormEvent, ReactNode } from 'react'

import { Button } from '@/components/atoms/Button'
import { DEFAULT_PROCESS_OPTIONS, findSizePreset, SIZE_PRESETS } from '@/utils/processPresets'

const CUSTOM_PRESET_ID = 'custom'
const field = tv({
  base: 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none',
})

/**
 * `<select>` only ever emits a value from its own `<option>`s, all sourced
 * from `IMAGE_FILTERS`. Positional: a type predicate can only narrow a
 * parameter it names directly.
 */
const isImageFilter = (value: string): value is ImageFilter =>
  IMAGE_FILTERS.some((filter) => filter === value)

export const ProcessImagePanel = ({
  imageName,
  onProcess,
  onClose,
  isProcessing = false,
  errorMessage = null,
  resultUrl = null,
  onImageError,
}: ProcessImagePanelProps) => {
  const presetId = useId()
  const widthId = useId()
  const heightId = useId()
  const filterId = useId()
  const qualityId = useId()

  const [width, setWidth] = useState(String(DEFAULT_PROCESS_OPTIONS.width))
  const [height, setHeight] = useState(String(DEFAULT_PROCESS_OPTIONS.height))
  const [filter, setFilter] = useState<ImageFilter>(DEFAULT_PROCESS_OPTIONS.filter)
  const [quality, setQuality] = useState(String(DEFAULT_PROCESS_OPTIONS.quality))
  // Tracks the `resultUrl` value that last failed, not just a boolean —
  // once a fresh token produces a different `resultUrl`, this naturally
  // stops matching and the error state clears without an effect.
  const [erroredResultUrl, setErroredResultUrl] = useState<string | null>(null)
  const hasResultError = resultUrl !== null && erroredResultUrl === resultUrl

  const selectedPreset = findSizePreset({ width: Number(width), height: Number(height) })

  const handlePresetChange = ({ nextPresetId }: { nextPresetId: string }) => {
    const preset = SIZE_PRESETS.find((candidate) => candidate.id === nextPresetId)

    if (!preset) {
      return
    }

    setWidth(String(preset.width))
    setHeight(String(preset.height))
  }

  const handleResultError = () => {
    setErroredResultUrl(resultUrl)
    onImageError?.()
  }

  const handleResultRetry = () => {
    setErroredResultUrl(null)
    onImageError?.()
  }

  const handleFilterChange = ({ value }: { value: string }) => {
    if (!isImageFilter(value)) {
      return
    }

    setFilter(value)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isProcessing) {
      return
    }

    onProcess({
      width: Number(width),
      height: Number(height),
      filter,
      quality: Number(quality),
    })
  }

  const renderResult = (): ReactNode => {
    if (resultUrl === null) {
      return null
    }

    if (hasResultError) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-2 rounded-md border border-slate-200 p-4 text-sm text-slate-600"
        >
          <span>Processed image failed to load</span>
          <Button variant="secondary" onClick={handleResultRetry}>
            Retry
          </Button>
        </div>
      )
    }

    return (
      <img
        src={resultUrl}
        alt={`Processed ${imageName}`}
        onError={handleResultError}
        className="w-full rounded-md border border-slate-200"
      />
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Process {imageName}</h3>
        <Button variant="secondary" aria-label="Close panel" onClick={onClose}>
          Close
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={presetId} className="text-sm font-medium text-slate-700">
            Size preset
          </label>
          <select
            id={presetId}
            value={selectedPreset?.id ?? CUSTOM_PRESET_ID}
            onChange={(event) => handlePresetChange({ nextPresetId: event.target.value })}
            className={field()}
          >
            <option value={CUSTOM_PRESET_ID}>Custom size</option>
            {SIZE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={widthId} className="text-sm font-medium text-slate-700">
              Width
            </label>
            <input
              id={widthId}
              type="number"
              min={MIN_PROCESS_DIMENSION_PX}
              max={MAX_PROCESS_DIMENSION_PX}
              value={width}
              onChange={(event) => setWidth(event.target.value)}
              className={field()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={heightId} className="text-sm font-medium text-slate-700">
              Height
            </label>
            <input
              id={heightId}
              type="number"
              min={MIN_PROCESS_DIMENSION_PX}
              max={MAX_PROCESS_DIMENSION_PX}
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              className={field()}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={filterId} className="text-sm font-medium text-slate-700">
              Filter
            </label>
            <select
              id={filterId}
              value={filter}
              onChange={(event) => handleFilterChange({ value: event.target.value })}
              className={field()}
            >
              {IMAGE_FILTERS.map((imageFilter) => (
                <option key={imageFilter} value={imageFilter}>
                  {imageFilter}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={qualityId} className="text-sm font-medium text-slate-700">
              Quality
            </label>
            <input
              id={qualityId}
              type="number"
              min={MIN_PROCESS_QUALITY}
              max={MAX_PROCESS_QUALITY}
              value={quality}
              onChange={(event) => setQuality(event.target.value)}
              className={field()}
            />
          </div>
        </div>

        <Button type="submit" disabled={isProcessing}>
          {isProcessing ? 'Processing…' : 'Process image'}
        </Button>
      </form>

      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage}
        </p>
      )}

      {renderResult()}
    </section>
  )
}
