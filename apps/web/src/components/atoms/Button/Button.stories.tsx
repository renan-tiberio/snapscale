import { Button } from './Button'

import type { Meta, StoryObj } from '@storybook/react-vite'

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
  args: {
    children: 'Click me',
  },
}

export default meta

type Story = StoryObj<typeof Button>

export const Primary: Story = {
  args: { variant: 'primary' },
}

export const Secondary: Story = {
  args: { variant: 'secondary' },
}

export const Disabled: Story = {
  args: { disabled: true },
}
