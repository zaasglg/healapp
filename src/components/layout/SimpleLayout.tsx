import { Outlet } from 'react-router-dom'

// Простой layout без Header для страниц заполнения профиля
export const SimpleLayout = () => {
  return (
    <div className="min-h-screen bg-white">
      <main className="w-full">
        <Outlet />
      </main>
    </div>
  )
}











