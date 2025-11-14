import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export const Header = () => {
  const location = useLocation()
  const { user } = useAuthStore()

  // handleLogout удален - не используется

  // Показываем Header только на определенных страницах
  const showHeader = location.pathname !== '/profile/setup'

  if (!showHeader) {
    return null
  }

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-center relative">
        <h1 className="text-lg font-bold text-gray-dark">
          Дневник подопечного
        </h1>
        {user && (
          <Link
            to="/profile"
            className="absolute right-4 w-10 h-10 flex items-center justify-center hover:opacity-80 transition-opacity"
          >
            <img
              src="/Иконка профиль.png"
              alt="Профиль"
              width={40}
              height={40}
              loading="lazy"
              className="w-full h-full object-contain"
            />
          </Link>
        )}
      </div>
    </header>
  )
}



