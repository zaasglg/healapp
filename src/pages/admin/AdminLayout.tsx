import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams, NavLink } from 'react-router-dom'
import { Button } from '@/components/ui'

const ADMIN_ACCESS_KEY = 'admin_panel_access_granted'
const ADMIN_TOKEN_STORAGE_KEY = 'admin_panel_token'

const FALLBACK_DEV_TOKEN = 'b8f56f5c-62f1-45d9-9e5a-e8bbfdadcf0f'

const useAllowedTokens = () =>
  useMemo(() => {
    const tokensEnv = import.meta.env.VITE_ADMIN_TOKENS as string | undefined
    const tokenEnv = import.meta.env.VITE_ADMIN_TOKEN as string | undefined
    const tokens: string[] = []

    if (tokensEnv) {
      tokens.push(
        ...tokensEnv
          .split(',')
          .map(token => token.trim())
          .filter(Boolean)
      )
    }

    if (tokenEnv) {
      tokens.push(tokenEnv.trim())
    }

    if (tokens.length === 0) {
      // Дев-токен по умолчанию (для локальной разработки без переменных окружения)
      tokens.push(FALLBACK_DEV_TOKEN)
    } else if (!tokens.includes(FALLBACK_DEV_TOKEN)) {
      tokens.push(FALLBACK_DEV_TOKEN)
    }

    return Array.from(new Set(tokens))
  }, [])

type AccessState = 'checking' | 'authorized' | 'denied'

export const AdminLayout = () => {
  const allowedTokens = useAllowedTokens()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState<AccessState>('checking')
  const [error, setError] = useState<string | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isRoot = location.pathname === '/admin'

  const tokenFromUrl = searchParams.get('token')

  useEffect(() => {
    const storedAccess = localStorage.getItem(ADMIN_ACCESS_KEY)
    const storedToken = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)

    if (storedAccess === 'true' && storedToken && allowedTokens.includes(storedToken)) {
      setStatus('authorized')
      setError(null)
      return
    }

    if (tokenFromUrl) {
      if (allowedTokens.includes(tokenFromUrl)) {
        localStorage.setItem(ADMIN_ACCESS_KEY, 'true')
        localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, tokenFromUrl)

        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('token')
        setSearchParams(nextParams, { replace: true })
        setStatus('authorized')
        setError(null)
      } else {
        localStorage.removeItem(ADMIN_ACCESS_KEY)
        localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
        setStatus('denied')
        setError('Недействительный токен доступа. Убедитесь, что используете актуальную ссылку админ-панели.')
      }
      return
    }

    setStatus('denied')
    setError('Для доступа к админ-панели добавьте параметр token=ВАШ_ТОКЕН в адресную строку.')
  }, [allowedTokens, setSearchParams, tokenFromUrl, searchParams, location.pathname])

  const handleExit = () => {
    localStorage.removeItem(ADMIN_ACCESS_KEY)
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
    setStatus('denied')
    setError('Доступ закрыт. Чтобы вернуться, используйте токен из ссылки админ-панели.')
    navigate('/', { replace: true })
  }

  useEffect(() => {
    setIsMenuOpen(false)
  }, [location.pathname])

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-[#55ACBF] border-t-transparent rounded-full mx-auto"></div>
          <p className="text-sm text-gray-600">Проверяем права доступа…</p>
        </div>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-lg p-8 space-y-6 text-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Доступ ограничен</h1>
            {error && <p className="text-sm text-gray-600">{error}</p>}
          </div>
          <div className="space-y-3">
            <Button onClick={() => navigate('/', { replace: true })} fullWidth>
              Вернуться на главную
            </Button>
            <p className="text-xs text-gray-500">
              Администратор получает доступ только по постоянной ссылке с токеном. Добавьте параметр
              <span className="font-semibold"> token</span> в URL и перезагрузите страницу.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isRoot && (
              <button
                onClick={() => navigate('/admin')}
                className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-600 hover:text-[#0A6D83] hover:border-[#55ACBF] transition-colors"
                aria-label="Вернуться на главную панель"
              >
                ←
              </button>
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Административная панель</p>
              <h1 className="text-xl font-bold text-gray-800">Управление платформой</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="sm:hidden inline-flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#55ACBF]"
              onClick={() => setIsMenuOpen(prev => !prev)}
              aria-label="Открыть меню разделов"
            >
              <span className="sr-only">Меню</span>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
            </button>
            <nav className="hidden sm:flex items-center gap-3 text-sm">
              <NavLink
                to="/admin"
                end
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-[#55ACBF]/10 text-[#0A6D83] font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                Главная
              </NavLink>
              <NavLink
                to="/admin/invites"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-[#55ACBF]/10 text-[#0A6D83] font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                Пригласительные
              </NavLink>
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-[#55ACBF]/10 text-[#0A6D83] font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                Пользователи
              </NavLink>
              <NavLink
                to="/admin/support"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-[#55ACBF]/10 text-[#0A6D83] font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                Поддержка
              </NavLink>
              <NavLink
                to="/admin/monitoring"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-[#55ACBF]/10 text-[#0A6D83] font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                Мониторинг
              </NavLink>
            </nav>
            <Button variant="outline" size="sm" onClick={handleExit}>
              Выйти
            </Button>
          </div>
        </div>
        {isMenuOpen && (
          <div className="sm:hidden border-t border-gray-200 bg-white">
            <nav className="px-4 py-3 space-y-2 text-sm">
              <NavLink
                to="/admin"
                end
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-[#55ACBF]/10 text-[#0A6D83] font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                Главная
              </NavLink>
              <NavLink
                to="/admin/invites"
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-[#55ACBF]/10 text-[#0A6D83] font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                Пригласительные
              </NavLink>
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-[#55ACBF]/10 text-[#0A6D83] font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                Пользователи
              </NavLink>
              <NavLink
                to="/admin/support"
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-[#55ACBF]/10 text-[#0A6D83] font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                Поддержка
              </NavLink>
              <NavLink
                to="/admin/monitoring"
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-[#55ACBF]/10 text-[#0A6D83] font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                Мониторинг
              </NavLink>
            </nav>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}


