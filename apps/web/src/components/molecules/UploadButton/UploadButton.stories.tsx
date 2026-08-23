import { UploadButton } from './UploadButton'

import type { Meta, StoryObj } from '@storybook/react-vite'

const meta: Meta<typeof UploadButton> = {
  title: 'Molecules/UploadButton',
  component: UploadButton,
  args: {
    onFileSelected: () => undefined,
  },
}

export default meta

type Story = StoryObj<typeof UploadButton>

export const Idle: Story = {}

export const Uploading: Story = {
  args: { isUploading: true },
}
