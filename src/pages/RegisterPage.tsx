import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { useAuthStore } from '@/store/authStore'
import {
  ensureEmployeeInviteTokens,
  updateEmployeeInviteToken,
} from '@/utils/inviteStorage'

// Типы организаций
type OrganizationType = 'pension' | 'patronage_agency' | 'caregiver'

// Схема валидации для регистрации
const registerSchema = z.object({
  email: z.string().email('Некорректный email адрес'),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Пароли не совпадают',
  path: ['confirmPassword'],
})

const employeeRegisterSchema = z.object({
  phone: z.string().min(10, 'Введите номер телефона'),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов'),
  confirmPassword: z.string().min(1, 'Подтвердите пароль'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Пароли не совпадают',
  path: ['confirmPassword'],
})

const employeeRoleNames: Record<string, string> = {
  admin: 'Администратор',
  manager: 'Руководитель',
  caregiver: 'Сиделка',
  doctor: 'Врач',
}

type RegisterFormData = z.infer<typeof registerSchema>
type EmployeeRegisterFormData = z.infer<typeof employeeRegisterSchema>

const formatPhone = (raw: string) => {
  let value = raw.trim().replace(/\s+/g, '')
  if (!value) return ''
  value = value.replace(/[^\d+]/g, '')
  if (value.startsWith('+')) {
    return value
  }
  if (value.startsWith('8')) {
    return `+7${value.slice(1)}`
  }
  if (value.startsWith('7')) {
    return `+${value}`
  }
  if (!value.startsWith('7')) {
    return `+7${value}`
  }
  return value
}

const createEmployeeId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `employee_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

export const RegisterPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const orgToken = searchParams.get('org_token')
  const clientToken = searchParams.get('client_token')
  const diaryForClientToken = searchParams.get('diary')
  const hasInviteToken = Boolean(token)
  const isOrgInvite = Boolean(orgToken)

  useEffect(() => {
    if (!clientToken) return
    const redirectParams = new URLSearchParams()
    redirectParams.set('token', clientToken)
    if (diaryForClientToken) {
      redirectParams.set('diary', diaryForClientToken)
    }
    navigate(`/client-invite?${redirectParams.toString()}`, { replace: true })
  }, [clientToken, diaryForClientToken, navigate])

  if (clientToken) {
    return null
  }

  const [selectedType, setSelectedType] = useState<OrganizationType | null>(null)
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(hasInviteToken ? null : true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgInviteError, setOrgInviteError] = useState<string | null>(null)
  const [orgInviteStatus, setOrgInviteStatus] = useState<'checking' | 'invalid' | 'form'>(
    isOrgInvite ? 'checking' : 'form'
  )
  const [orgInvite, setOrgInvite] = useState<any | null>(null)

  const { setSession, setUser: setAuthUser } = useAuthStore()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const {
    register: registerEmployee,
    handleSubmit: handleSubmitEmployee,
    formState: { errors: employeeErrors },
  } = useForm<EmployeeRegisterFormData>({
    resolver: zodResolver(employeeRegisterSchema),
  })

  // Проверка валидности токена
  useEffect(() => {
    if (clientToken) return
    if (!hasInviteToken) {
      // Свободная регистрация без приглашения
      setIsTokenValid(true)
      return
    }

    const validateToken = async () => {
      try {
        // TODO: Проверить токен в БД когда будет готова таблица invite_tokens
        // Пока считаем что токен валиден если он есть
        setIsTokenValid(true)
      } catch (err) {
        setIsTokenValid(false)
        setError('Недействительный токен приглашения')
      }
    }

    validateToken()
  }, [clientToken, hasInviteToken, token])

  useEffect(() => {
    if (!isOrgInvite || clientToken) return

    setOrgInviteStatus('checking')
    setOrgInviteError(null)

    try {
      const tokens = ensureEmployeeInviteTokens()
      const invite = tokens.find(item => String(item.token) === String(orgToken))

      if (!invite) {
        setOrgInviteStatus('invalid')
        setOrgInviteError('Пригласительная ссылка недействительна или была удалена.')
        return
      }

      if (invite.used_at) {
        setOrgInviteStatus('invalid')
        setOrgInviteError('Эта пригласительная ссылка уже была использована.')
        return
      }

      setOrgInvite(invite)
      setOrgInviteStatus('form')
    } catch (err) {
      console.error('Ошибка проверки пригласительной ссылки сотрудника', err)
      setOrgInviteStatus('invalid')
      setOrgInviteError('Не удалось проверить пригласительную ссылку. Попробуйте позже.')
    }
  }, [isOrgInvite, orgToken, clientToken])

  const onSubmit = async (data: RegisterFormData) => {
    if (!selectedType) {
      setError('Выберите тип организации')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Регистрация через Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            organization_type: selectedType,
            invite_token: token || undefined,
          },
        },
      })

      if (authError) {
        throw authError
      }

      if (authData.user) {
        // TODO: Отметить токен как использованный в БД
        // Перенаправление на страницу заполнения профиля
        navigate('/profile/setup')
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка при регистрации. Попробуйте ещё раз.')
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitOrgInvite = async (data: EmployeeRegisterFormData) => {
    if (!isOrgInvite || !orgToken || !orgInvite) return

    setIsLoading(true)
    setOrgInviteError(null)

    try {
      const phone = formatPhone(data.phone)
      if (!phone) {
        setOrgInviteError('Введите корректный номер телефона')
        setIsLoading(false)
        return
      }

      const usersRaw = localStorage.getItem('local_users')
      const users = usersRaw ? JSON.parse(usersRaw) : []
      if (users.some((user: any) => user.phone === phone)) {
        setOrgInviteError('Пользователь с таким номером телефона уже зарегистрирован')
        setIsLoading(false)
        return
      }

      const employeeId = createEmployeeId()
      const now = new Date().toISOString()

      const newUser = {
        id: employeeId,
        phone,
        password: data.password,
        user_role: 'org_employee',
        organization_id: orgInvite.organization_id || null,
        organization_type: orgInvite.organization_type || null,
        employee_role: orgInvite.role || null,
        organization_invite_token: orgToken,
        created_at: now,
      }

      const nextUsers = [...users, newUser]
      localStorage.setItem('local_users', JSON.stringify(nextUsers))

      const currentUserPayload = {
        id: employeeId,
        phone,
        user_role: 'org_employee',
        organization_id: orgInvite.organization_id || null,
        organization_type: orgInvite.organization_type || null,
        employee_role: orgInvite.role || null,
        organization_invite_token: orgToken,
        created_at: now,
      }

      localStorage.setItem('current_user', JSON.stringify(currentUserPayload))
      const authToken = `token_${employeeId}`
      localStorage.setItem('auth_token', authToken)

      const sessionPayload = {
        user: currentUserPayload,
        access_token: authToken,
        refresh_token: `refresh_${employeeId}`,
      }

      setSession(sessionPayload as any)
      setAuthUser(currentUserPayload as any)

      try {
        updateEmployeeInviteToken(orgToken, invite => ({
          ...invite,
          used_at: now,
          used_by: employeeId,
        }))
      } catch (updateError) {
        console.warn('Не удалось отметить токен как использованный', updateError)
      }

      navigate('/profile/setup')
    } catch (err) {
      console.error('Ошибка регистрации по приглашению организации', err)
      setOrgInviteError('Не удалось завершить регистрацию. Попробуйте ещё раз.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isOrgInvite) {
    if (orgInviteStatus === 'checking') {
      return (
        <div className="text-center py-8">
          <div className="animate-spin w-12 h-12 border-4 border-blue-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Проверяем пригласительную ссылку...</p>
        </div>
      )
    }

    if (orgInviteStatus === 'invalid') {
      return (
        <div className="text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-dark mb-3">Недействительная ссылка</h1>
            <p className="text-gray-600 text-sm mb-6">
              {orgInviteError || 'Эта пригласительная ссылка недействительна или уже была использована.'}
            </p>
          </div>
          <Button onClick={() => navigate('/login')} fullWidth size="lg">
            Войти в систему
          </Button>
        </div>
      )
    }

    return (
      <div>
        <h1 className="text-[32px] font-bold text-gray-dark mb-2 text-center">
          Регистрация сотрудника
        </h1>
        <p className="text-gray-600 text-center text-sm mb-6">
          Введите номер телефона и придумайте пароль, чтобы получить доступ к дневникам организации.
        </p>
        {orgInvite?.role && (
          <p className="text-center text-sm text-gray-500 mb-6">
            Ваша роль: {employeeRoleNames[orgInvite.role] || 'Сотрудник'}
          </p>
        )}

        <form onSubmit={handleSubmitEmployee(onSubmitOrgInvite)} className="space-y-5">
          <Input
            label="Введите номер телефона"
            type="tel"
            placeholder="Номер телефона"
            error={employeeErrors.phone?.message}
            fullWidth
            {...registerEmployee('phone')}
          />

          <Input
            label="Придумайте пароль"
            type="password"
            placeholder="Пароль"
            error={employeeErrors.password?.message}
            helperText="Минимум 6 символов"
            fullWidth
            {...registerEmployee('password')}
          />

          <Input
            label="Подтвердите пароль"
            type="password"
            placeholder="Повторите пароль"
            error={employeeErrors.confirmPassword?.message}
            fullWidth
            {...registerEmployee('confirmPassword')}
          />

          {orgInviteError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-600">{orgInviteError}</p>
            </div>
          )}

          <Button
            type="submit"
            fullWidth
            isLoading={isLoading}
            size="lg"
          >
            Завершить регистрацию
          </Button>
        </form>
      </div>
    )
  }

  // Если токен не валиден
  if (isTokenValid === false) {
    return (
      <div className="text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-dark mb-3">
            Недействительная ссылка
          </h1>
          <p className="text-gray-600 text-sm mb-6">
            {error || 'Эта ссылка для регистрации недействительна или уже использована.'}
          </p>
        </div>
        <Button onClick={() => navigate('/login')} fullWidth size="lg">
          Войти в систему
        </Button>
      </div>
    )
  }

  // Проверка токена в процессе
  if (isTokenValid === null) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-12 h-12 border-4 border-blue-primary border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600">Проверка приглашения...</p>
      </div>
    )
  }

  // Шаг 1: Выбор типа организации
  if (!selectedType) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-dark mb-2 text-center">
          Регистрация
        </h1>
        <p className="text-gray-600 mb-8 text-center text-sm">
          Выберите тип вашей организации
        </p>

        <div className="space-y-4">
          <button
            onClick={() => setSelectedType('pension')}
            className="w-full p-6 bg-gradient-to-br from-[#55ACBF] to-[#4A9BAD] rounded-2xl shadow-md hover:shadow-xl transition-all text-white text-left transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <h3 className="font-bold text-xl mb-2">Пансионат</h3>
            <p className="text-sm text-white/90">
              Учреждение для ухода за подопечными
            </p>
          </button>

          <button
            onClick={() => setSelectedType('patronage_agency')}
            className="w-full p-6 bg-gradient-to-br from-[#4A9BAD] to-[#3D8291] rounded-2xl shadow-md hover:shadow-xl transition-all text-white text-left transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <h3 className="font-bold text-xl mb-2">Патронажное агентство</h3>
            <p className="text-sm text-white/90">
              Агентство по предоставлению услуг ухода
            </p>
          </button>

          <button
            onClick={() => setSelectedType('caregiver')}
            className="w-full p-6 bg-gradient-to-br from-[#3D8291] to-[#2F6A78] rounded-2xl shadow-md hover:shadow-xl transition-all text-white text-left transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <h3 className="font-bold text-xl mb-2">Частная сиделка</h3>
            <p className="text-sm text-white/90">
              Индивидуальный специалист по уходу
            </p>
          </button>
        </div>
      </div>
    )
  }

  // Шаг 2: Форма регистрации
  return (
    <div>
      <button
        onClick={() => setSelectedType(null)}
        className="flex items-center gap-2 text-blue-primary hover:text-blue-600 mb-6 text-sm font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Назад к выбору типа
      </button>

      <h1 className="text-3xl font-bold text-gray-dark mb-2 text-center">
        Регистрация
      </h1>
      <p className="text-gray-600 mb-6 text-center text-sm">
        {selectedType === 'pension' ? 'Пансионат' : selectedType === 'patronage_agency' ? 'Патронажное агентство' : 'Частная сиделка'}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Input
          label="Введите почту"
          type="email"
          placeholder="Почта"
          error={errors.email?.message}
          fullWidth
          {...register('email')}
        />

        <Input
          label="Придумайте пароль"
          type="password"
          placeholder="Пароль"
          error={errors.password?.message}
          helperText="Минимум 6 символов"
          fullWidth
          {...register('password')}
        />

        <Input
          label="Подтвердите пароль"
          type="password"
          placeholder="Повторите пароль"
          error={errors.confirmPassword?.message}
          fullWidth
          {...register('confirmPassword')}
        />

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          fullWidth
          isLoading={isLoading}
          size="lg"
        >
          Зарегистрироваться
        </Button>

        <p className="text-center text-sm text-gray-600 mt-4">
          Если уже есть аккаунт, нажмите{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-gray-dark font-semibold underline"
          >
            Войти
          </button>
        </p>
      </form>
    </div>
  )
}

