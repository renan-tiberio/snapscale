import { Link } from 'react-router'

import type { AlbumCardProps } from './AlbumCard.types'

import { Button } from '@/components/atoms/Button'

export function AlbumCard({ album, href, onDelete, isDeleting = false }: AlbumCardProps) {
  return (
    <article className="flex h-full flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">
        <Link to={href} className="text-brand-600 hover:underline">
          {album.name}
        </Link>
      </h2>
      <p className="grow text-sm text-slate-600">{album.description ?? 'No description'}</p>
      <Button
        variant="secondary"
        aria-label={`Delete ${album.name}`}
        disabled={isDeleting}
        onClick={() => onDelete(album.id)}
      >
        {isDeleting ? 'Deleting…' : 'Delete'}
      </Button>
    </article>
  )
}
