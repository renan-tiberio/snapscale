import type { ImageCardProps } from './ImageCard.types'

import { Button } from '@/components/atoms/Button'


export function ImageCard({ image, src, onProcess, isSelected = false }: ImageCardProps) {
  return (
    <figure className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <img
        src={src}
        alt={image.originalFilename}
        className="h-40 w-full rounded-md bg-slate-100 object-cover"
      />
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
