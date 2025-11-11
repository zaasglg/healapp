import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export const useAuth = () => {
  const navigate = useNavigate()
  const { user, session, isAuthenticated, loading, setSession, checkAuth, logout } = useAuthStore()

  useEffect(() => {
    // Проверка текущей сессии при монтировании
    checkAuth()

    // Подписка на изменения авторизации
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email_confirmed_at)
        setSession(session)

        if (event === 'SIGNED_OUT') {
          navigate('/login')
        } else if (event === 'SIGNED_IN') {
          // ВАЖНО: Не редиректим на dashboard при регистрации (SIGNUP)
          // Регистрация обрабатывается в RegisterPage и редиректит на email-confirmation
          // Редиректим только если это реальный вход (не регистрация) и email подтвержден
          if (session?.user?.email_confirmed_at) {
            // Проверяем, заполнен ли профиль
            // TODO: Добавить проверку профиля когда будет готова таблица organizations
            // Проверяем текущий путь - если мы на странице подтверждения email, не редиректим
            const currentPath = window.location.pathname
            if (currentPath !== '/email-confirmation' && currentPath !== '/register') {
              navigate('/dashboard')
            }
          }
          // Если email не подтвержден, не редиректим - пользователь должен ввести код
        } else if (event === 'TOKEN_REFRESHED') {
          // Обновляем сессию при обновлении токена
          setSession(session)
        }
      }
    )

    // Отписка при размонтировании
    return () => {
      subscription.unsubscribe()
    }
  }, [checkAuth, setSession, navigate])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return {
    user,
    session,
    isAuthenticated,
    loading,
    logout: handleLogout,
  }
}


