import { useState } from 'react'

import { Button } from '@/components/atoms/Button'
import { TextInput } from '@/components/atoms/TextInput'

export function HomePage() {
  const [email, setEmail] = useState('')

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">SnapScale</h1>
      <TextInput label="Email" value={email} onChange={setEmail} placeholder="you@example.com" />
      <Button onClick={() => setEmail('')}>Clear</Button>
    </main>
  )
}
