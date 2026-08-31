import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('renders the matched child route inside the root layout', () => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: <App />,
        children: [{ index: true, element: <p>child content</p> }],
      },
    ])

    render(<RouterProvider router={router} />)

    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
