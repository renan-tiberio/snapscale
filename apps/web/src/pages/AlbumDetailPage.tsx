import { useState } from 'react'
import { Link, useParams } from 'react-router'

import type { ImageProcessOptions } from '@snapscale/shared'

import { ImageCard } from '@/components/molecules/ImageCard'
import { UploadButton } from '@/components/molecules/UploadButton'
import { ProcessImagePanel } from '@/components/organisms/ProcessImagePanel'
import { useAlbums } from '@/hooks/queries/useAlbums'
import { useImages } from '@/hooks/queries/useImages'
import { useProcessImage } from '@/hooks/queries/useProcessImage'
import { imageFileUrl, processedImageUrl } from '@/utils/imageUrls'


export function AlbumDetailPage() {
  const { albumId = '' } = useParams()
  const { albums } = useAlbums()
  const { images, isLoading, error, uploadImage, isUploading, uploadError } = useImages(albumId)
  const { processImage, processedImage, isProcessing, processError, reset } = useProcessImage()
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)

  const album = albums.find((candidate) => candidate.id === albumId)
  const selectedImage = images.find((image) => image.id === selectedImageId) ?? null
  const alertMessage = error?.message ?? uploadError?.message ?? null
  const isEmpty = !isLoading && error === null && images.length === 0

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
        <Link to="/" className="text-sm text-brand-600 hover:underline">
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
              src={imageFileUrl(image.id)}
              onProcess={handleSelect}
              isSelected={image.id === selectedImageId}
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
          resultUrl={processedImage === null ? null : processedImageUrl(processedImage.storagePath)}
        />
      )}
    </main>
  )
}
