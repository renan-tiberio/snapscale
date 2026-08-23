import { OtpCodeInput } from './OtpCodeInput'

import type { Meta, StoryObj } from '@storybook/react-vite'

const meta: Meta<typeof OtpCodeInput> = {
  title: 'Molecules/OtpCodeInput',
  component: OtpCodeInput,
  args: {
    value: '',
    onChange: () => undefined,
  },
}

export default meta

type Story = StoryObj<typeof OtpCodeInput>

export const Empty: Story = {}

export const Filled: Story = {
  args: { value: '123456' },
}

export const Disabled: Story = {
  args: { value: '1234', disabled: true },
}
