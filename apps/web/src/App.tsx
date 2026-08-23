import { Outlet } from 'react-router'

export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Outlet />
    </div>
  )
}
