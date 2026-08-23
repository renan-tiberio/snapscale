import { ImageCard } from './ImageCard'

import type { Meta, StoryObj } from '@storybook/react-vite'

const PLACEHOLDER_SRC =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="%232563eb"/></svg>'

const meta: Meta<typeof ImageCard> = {
  title: 'Molecules/ImageCard',
  component: ImageCard,
  args: {
    image: {
      id: 'bbbbbbbb-1111-4111-8111-111111111111',
      albumId: 'aaaaaaaa-1111-4111-8111-111111111111',
      ownerId: '11111111-1111-4111-8111-111111111111',
      originalFilename: 'sunset.png',
      storagePath: 'originals/user/sunset.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      width: 1920,
      height: 1080,
      createdAt: '2026-08-03T10:00:00.000Z',
      updatedAt: '2026-08-03T10:00:00.000Z',
    },
    src: PLACEHOLDER_SRC,
    onProcess: () => undefined,
  },
}

export default meta

type Story = StoryObj<typeof ImageCard>

export const Default: Story = {}

export const Selected: Story = {
  args: { isSelected: true },
}
