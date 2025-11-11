import { Outlet } from 'react-router-dom'
import { Header } from './Header'

export const MainLayout = () => {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="w-full">
        <Outlet />
      </main>
    </div>
  )
}












