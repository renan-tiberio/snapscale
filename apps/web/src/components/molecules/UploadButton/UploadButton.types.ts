export interface UploadButtonProps {
  onFileSelected: (file: File) => void
  label?: string
  /** Accepted mime types — defaults to the shared upload allowlist. */
  accept?: string
  isUploading?: boolean
}
