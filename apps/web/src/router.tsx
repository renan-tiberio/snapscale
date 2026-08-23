
import { createBrowserRouter } from 'react-router'

import { App } from './App'

import type { RouteObject } from 'react-router'

import { AlbumDetail } from '@/components/pages/AlbumDetail'
import { Albums } from '@/components/pages/Albums'
import { Login } from '@/components/pages/Login'
import { ProtectedRoute } from '@/components/pages/ProtectedRoute'

/**
 * Route tree, exported separately from the browser router so tests can mount
 * the very same tree through `createMemoryRouter`.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { path: 'login', element: <Login /> },
      {
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <Albums /> },
          { path: 'albums/:albumId', element: <AlbumDetail /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
