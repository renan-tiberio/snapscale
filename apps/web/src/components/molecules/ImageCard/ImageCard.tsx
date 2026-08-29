import { useState } from 'react'

import type { ImageCardProps } from './ImageCard.types'
import type { ReactNode } from 'react'

import { Button } from '@/components/atoms/Button'

export function ImageCard({
  image,
  src,
  onProcess,
  isSelected = false,
  onImageError,
}: ImageCardProps) {
  // Tracks the `src` value that last failed, not just a boolean — once a
  // fresh token produces a different `src`, this naturally stops matching
  // and the error state clears without an effect.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
  const hasError = src !== null && erroredSrc === src

  function handleError() {
    setErroredSrc(src)
    onImageError?.()
  }

  function handleRetry() {
    setErroredSrc(null)
    onImageError?.()
  }

  let media: ReactNode

  if (hasError) {
    media = (
      <div
        role="alert"
        className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md bg-slate-100 text-sm text-slate-600"
      >
        <span>Image failed to load</span>
        <Button variant="secondary" onClick={handleRetry}>
          Retry
        </Button>
      </div>
    )
  } else if (src === null) {
    media = (
      <div
        role="status"
        aria-label={`Loading ${image.originalFilename}`}
        className="h-40 w-full animate-pulse rounded-md bg-slate-100"
      />
    )
  } else {
    media = (
      <img
        src={src}
        alt={image.originalFilename}
        onError={handleError}
        className="h-40 w-full rounded-md bg-slate-100 object-cover"
      />
    )
  }

  return (
    <figure className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {media}
      <figcaption className="flex flex-col gap-1 text-sm">
        <span className="truncate font-medium text-slate-800">{image.originalFilename}</span>
        <span className="text-slate-500">
          {image.width} × {image.height}
        </span>
      </figcaption>
      <Button
        aria-label={`Process ${image.originalFilename}`}
        aria-pressed={isSelected}
        onClick={() => onProcess(image.id)}
      >
        Process
      </Button>
    </figure>
  )
}
