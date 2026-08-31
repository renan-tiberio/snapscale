import { createMemoryRouter, RouterProvider } from 'react-router'

import { AlbumCard } from './AlbumCard'

import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'

const album = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  userId: '11111111-1111-4111-8111-111111111111',
  name: 'Holidays',
  description: 'Beach photos from August',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
}

const withRouter = ({ children }: { children: ReactNode }) => {
  const router = createMemoryRouter([{ path: '/', element: children }])
  return <RouterProvider router={router} />
}

const meta: Meta<typeof AlbumCard> = {
  title: 'Molecules/AlbumCard',
  component: AlbumCard,
  args: {
    album,
    href: '/albums/aaaaaaaa-1111-4111-8111-111111111111',
    onDelete: () => undefined,
  },
  decorators: [(Story) => withRouter({ children: <Story /> })],
}

export default meta

type Story = StoryObj<typeof AlbumCard>

export const Default: Story = {}

export const WithoutDescription: Story = {
  args: { album: { ...album, description: null } },
}

export const Deleting: Story = {
  args: { isDeleting: true },
}
