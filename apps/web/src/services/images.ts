import type { Image, ProcessedImage, ProcessImageParams } from '@snapscale/shared'

export async function listImages(_albumId: string): Promise<Image[]> {
  return Promise.resolve([])
}

export async function uploadImage(_formData: FormData): Promise<Image> {
  return Promise.reject(new Error('not implemented'))
}

export async function processImage(_params: ProcessImageParams): Promise<ProcessedImage> {
  return Promise.reject(new Error('not implemented'))
}
