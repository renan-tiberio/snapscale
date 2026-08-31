import { ALLOWED_IMAGE_MIME_TYPES } from '@snapscale/shared'
import { useId } from 'react'

import type { UploadButtonProps } from './UploadButton.types'

export const UploadButton = ({
  onFileSelected,
  label = 'Upload image',
  accept = ALLOWED_IMAGE_MIME_TYPES.join(','),
  isUploading = false,
}: UploadButtonProps) => {
  const inputId = useId()

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={isUploading}
        onChange={(event) => {
          const file = event.target.files?.[0]

          if (file) {
            onFileSelected({ file })
          }
        }}
        className="file:bg-brand-600 hover:file:bg-brand-700 text-sm file:mr-3 file:rounded-md file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white disabled:cursor-not-allowed disabled:opacity-60"
      />
      {isUploading ? <span className="text-sm text-slate-500">Uploading…</span> : null}
    </div>
  )
}
