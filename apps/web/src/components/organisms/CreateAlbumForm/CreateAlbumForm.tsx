import { useState } from 'react'

import type { CreateAlbumFormProps } from './CreateAlbumForm.types'
import type { FormEvent } from 'react'

import { Button } from '@/components/atoms/Button'
import { TextInput } from '@/components/atoms/TextInput'

export const CreateAlbumForm = ({
  onCreate,
  isCreating = false,
  errorMessage = null,
}: CreateAlbumFormProps) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const trimmedName = name.trim()
  const canSubmit = trimmedName !== '' && !isCreating

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    const trimmedDescription = description.trim()
    onCreate(
      trimmedDescription === ''
        ? { name: trimmedName }
        : { name: trimmedName, description: trimmedDescription },
    )
    setName('')
    setDescription('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end"
    >
      <TextInput
        label="Album name"
        value={name}
        onChange={({ value }) => setName(value)}
        placeholder="Holidays"
      />
      <TextInput
        label="Description"
        value={description}
        onChange={({ value }) => setDescription(value)}
        placeholder="Optional"
      />
      <Button type="submit" disabled={!canSubmit}>
        {isCreating ? 'Creating…' : 'Create album'}
      </Button>
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage}
        </p>
      )}
    </form>
  )
}
