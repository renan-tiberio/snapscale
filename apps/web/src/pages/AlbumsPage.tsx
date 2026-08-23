import { Button } from '@/components/atoms/Button'
import { AlbumCard } from '@/components/molecules/AlbumCard'
import { CreateAlbumForm } from '@/components/organisms/CreateAlbumForm'
import { useAlbums } from '@/hooks/queries/useAlbums'
import { useAuth } from '@/hooks/queries/useAuth'

export function AlbumsPage() {
  const { user, logout } = useAuth()
  const { albums, isLoading, error, createAlbum, isCreating, createError, deleteAlbum, isDeleting } =
    useAlbums()

  const isEmpty = !isLoading && error === null && albums.length === 0

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Albums</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{user?.email}</span>
          <Button variant="secondary" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <CreateAlbumForm
        onCreate={createAlbum}
        isCreating={isCreating}
        errorMessage={createError?.message ?? null}
      />

      {error === null ? null : (
        <p role="alert" className="text-sm text-red-600">
          {error.message}
        </p>
      )}

      {isLoading ? <p className="text-sm text-slate-500">Loading albums…</p> : null}
      {isEmpty ? (
        <p className="text-sm text-slate-500">No albums yet — create your first one.</p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {albums.map((album) => (
          <li key={album.id}>
            <AlbumCard
              album={album}
              href={`/albums/${album.id}`}
              onDelete={deleteAlbum}
              isDeleting={isDeleting}
            />
          </li>
        ))}
      </ul>
    </main>
  )
}
