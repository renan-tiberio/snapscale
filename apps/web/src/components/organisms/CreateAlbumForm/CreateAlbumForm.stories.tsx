import { CreateAlbumForm } from './CreateAlbumForm'

import type { Meta, StoryObj } from '@storybook/react-vite'

const meta: Meta<typeof CreateAlbumForm> = {
  title: 'Organisms/CreateAlbumForm',
  component: CreateAlbumForm,
  args: {
    onCreate: () => undefined,
  },
}

export default meta

type Story = StoryObj<typeof CreateAlbumForm>

export const Default: Story = {}

export const Creating: Story = {
  args: { isCreating: true },
}

export const WithError: Story = {
  args: { errorMessage: 'Album name is already taken' },
}
