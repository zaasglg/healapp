import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useEffect } from 'react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, loading, checkAuth, session, user } = useAuthStore()

  // Проверяем авторизацию при монтировании компонента
  useEffect(() => {
    // Если уже есть сессия и пользователь авторизован, не вызываем checkAuth
    // Это предотвращает race condition после регистрации
    if (session && user && isAuthenticated) {
      // Уже авторизован, сбрасываем loading если нужно
      if (loading) {
        console.log('ProtectedRoute: Already authenticated, resetting loading')
        useAuthStore.getState().setLoading(false)
      }
      return
    }
    
    // Если нет сессии/пользователя, вызываем checkAuth
    // Это предотвращает застревание в состоянии загрузки
    if (!session && !user && !isAuthenticated) {
      console.log('ProtectedRoute: No session/user found, calling checkAuth()')
      const checkAuthPromise = checkAuth()
      // Устанавливаем таймаут на случай если checkAuth зависнет
      const timeout = setTimeout(() => {
        console.warn('ProtectedRoute: checkAuth timeout, resetting loading')
        useAuthStore.getState().setLoading(false)
      }, 5000) // 5 секунд таймаут
      
      checkAuthPromise
        .then(() => {
          clearTimeout(timeout)
        })
        .catch((err) => {
          clearTimeout(timeout)
          console.error('ProtectedRoute: checkAuth failed:', err)
          // В случае ошибки сбрасываем loading
          useAuthStore.getState().setLoading(false)
        })
    } else if (loading && (session || user)) {
      // Если есть сессия/пользователь, но loading: true, сбрасываем loading
      console.log('ProtectedRoute: Resetting loading state (have session/user)')
      useAuthStore.getState().setLoading(false)
    }
  }, [checkAuth, session, user, isAuthenticated, loading])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-primary border-t-transparent rounded-full"></div>
        <p className="ml-4 text-gray-600">Загрузка...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    console.log('ProtectedRoute: Not authenticated, redirecting to /login')
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}


