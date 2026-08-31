export type UploadButtonSelection = { file: File }

export type UploadButtonProps = {
  onFileSelected: (selection: UploadButtonSelection) => void
  label?: string
  /** Accepted mime types — defaults to the shared upload allowlist. */
  accept?: string
  isUploading?: boolean
}
