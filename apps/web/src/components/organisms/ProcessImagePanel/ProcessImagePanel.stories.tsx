import { ProcessImagePanel } from './ProcessImagePanel'

import type { Meta, StoryObj } from '@storybook/react-vite'

const RESULT_SRC =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="%23475569"/></svg>'

const meta: Meta<typeof ProcessImagePanel> = {
  title: 'Organisms/ProcessImagePanel',
  component: ProcessImagePanel,
  args: {
    imageName: 'sunset.png',
    onProcess: () => undefined,
    onClose: () => undefined,
  },
}

export default meta

type Story = StoryObj<typeof ProcessImagePanel>

export const Default: Story = {}

export const Processing: Story = {
  args: { isProcessing: true },
}

export const WithResult: Story = {
  args: { resultUrl: RESULT_SRC },
}

export const WithError: Story = {
  args: { errorMessage: 'width must be at least 16' },
}
