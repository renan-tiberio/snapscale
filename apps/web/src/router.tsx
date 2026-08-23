import { createBrowserRouter } from 'react-router'

import { App } from './App'
import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { AlbumsPage } from './pages/AlbumsPage'
import { LoginPage } from './pages/LoginPage'
import { ProtectedRoute } from './pages/ProtectedRoute'

import type { RouteObject } from 'react-router'

/**
 * Route tree, exported separately from the browser router so tests can mount
 * the very same tree through `createMemoryRouter`.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <AlbumsPage /> },
          { path: 'albums/:albumId', element: <AlbumDetailPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
