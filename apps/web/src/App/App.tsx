import { Outlet } from 'react-router'

import { AppProviders } from '../context/AppProviders'

export const App = () => {
  return (
    <AppProviders>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Outlet />
      </div>
    </AppProviders>
  )
}
