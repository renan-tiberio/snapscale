import { useState } from 'react'

import { TextInput } from './TextInput'

import type { Meta, StoryObj } from '@storybook/react-vite'

const meta: Meta<typeof TextInput> = {
  title: 'Atoms/TextInput',
  component: TextInput,
}

export default meta

type Story = StoryObj<typeof TextInput>

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = useState('')
    return <TextInput {...args} value={value} onChange={({ value: next }) => setValue(next)} />
  },
  args: {
    label: 'Email',
    placeholder: 'you@example.com',
  },
}

export const Disabled: Story = {
  args: {
    label: 'Email',
    value: 'locked@example.com',
    onChange: () => undefined,
    disabled: true,
  },
}
