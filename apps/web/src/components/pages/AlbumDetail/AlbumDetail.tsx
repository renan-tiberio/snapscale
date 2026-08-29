import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import type { ImageProcessOptions } from '@snapscale/shared'

import { ImageCard } from '@/components/molecules/ImageCard'
import { UploadButton } from '@/components/molecules/UploadButton'
import { ProcessImagePanel } from '@/components/organisms/ProcessImagePanel'
import { useAlbums } from '@/hooks/queries/useAlbums'
import { useFileToken } from '@/hooks/queries/useFileToken'
import { useImages } from '@/hooks/queries/useImages'
import { useProcessImage } from '@/hooks/queries/useProcessImage'
import { imageFileUrl, processedImageUrl } from '@/utils/imageUrls'

export function AlbumDetail() {
  const { albumId = '' } = useParams()
  // The short-lived `scope: 'file'` token, never the session token — see
  // `hooks/queries/useFileToken.ts` and `utils/imageUrls.ts`.
  const { fileToken, refresh: refreshFileToken } = useFileToken()
  const { albums } = useAlbums()
  const { images, isLoading, error, uploadImage, isUploading, uploadError } = useImages(albumId)
  const { processImage, processedImage, isProcessing, processError, reset } = useProcessImage()
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)

  const album = albums.find((candidate) => candidate.id === albumId)
  const selectedImage = images.find((image) => image.id === selectedImageId) ?? null
  const alertMessage = error?.message ?? uploadError?.message ?? null
  const isEmpty = !isLoading && error === null && images.length === 0

  // Rebuilt only when `images` or `fileToken` actually change — not on every
  // unrelated re-render (upload progress, selection, …) — so the `<img
  // src>` stays byte-for-byte stable and the browser doesn't treat it as a
  // new resource to re-download between token rotations.
  const imageSrcById = useMemo(() => {
    if (fileToken === null) {
      return new Map<string, string>()
    }

    return new Map(images.map((image) => [image.id, imageFileUrl(image.id, fileToken)]))
  }, [images, fileToken])

  const resultUrl = useMemo(() => {
    if (processedImage === null || fileToken === null) {
      return null
    }

    return processedImageUrl(processedImage.storagePath, fileToken)
  }, [processedImage, fileToken])

  function handleSelect(imageId: string) {
    reset()
    setSelectedImageId(imageId)
  }

  function handleClose() {
    reset()
    setSelectedImageId(null)
  }

  function handleProcess(options: ImageProcessOptions) {
    if (selectedImage === null) {
      return
    }

    processImage({ ...options, imageId: selectedImage.id })
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Link to="/" className="text-brand-600 text-sm hover:underline">
          ← Back to albums
        </Link>
        <h1 className="text-2xl font-semibold">{album?.name ?? 'Album'}</h1>
      </header>

      <UploadButton onFileSelected={uploadImage} isUploading={isUploading} />

      {alertMessage === null ? null : (
        <p role="alert" className="text-sm text-red-600">
          {alertMessage}
        </p>
      )}

      {isLoading ? <p className="text-sm text-slate-500">Loading images…</p> : null}
      {isEmpty ? (
        <p className="text-sm text-slate-500">No images yet — upload your first one.</p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((image) => (
          <li key={image.id}>
            <ImageCard
              image={image}
              src={imageSrcById.get(image.id) ?? null}
              onProcess={handleSelect}
              isSelected={image.id === selectedImageId}
              onImageError={refreshFileToken}
            />
          </li>
        ))}
      </ul>

      {selectedImage === null ? null : (
        <ProcessImagePanel
          imageName={selectedImage.originalFilename}
          onProcess={handleProcess}
          onClose={handleClose}
          isProcessing={isProcessing}
          errorMessage={processError?.message ?? null}
          resultUrl={resultUrl}
          onImageError={refreshFileToken}
        />
      )}
    </main>
  )
}
