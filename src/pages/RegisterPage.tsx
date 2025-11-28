import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { useAuthStore } from '@/store/authStore'
import { getFunctionUrl } from '@/utils/supabaseConfig'
// Убрано: импорты localStorage утилит (все через бэкенд)

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

export const RegisterPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(hasInviteToken ? null : false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgInviteError, setOrgInviteError] = useState<string | null>(null)
  const [orgInviteStatus, setOrgInviteStatus] = useState<'checking' | 'invalid' | 'form'>(
    isOrgInvite ? 'checking' : 'form'
  )
  const [orgInvite, setOrgInvite] = useState<any | null>(null)

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
    if (!hasInviteToken && !isOrgInvite) {
      setIsTokenValid(false)
      setError('Регистрация доступна только по пригласительной ссылке')
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
    if (!isOrgInvite || clientToken || !orgToken) return

    setOrgInviteStatus('checking')
    setOrgInviteError(null)

    const validateInvite = async () => {
      try {
        // Проверяем токен через Supabase
        const { data, error } = await supabase
          .from('invite_tokens')
          .select(`
            id,
            token,
            invite_type,
            expires_at,
            used_at,
            revoked_at,
            organization_invite_tokens (
              organization_id,
              organization_type,
              employee_role
            )
          `)
          .eq('token', orgToken)
          .eq('invite_type', 'organization_employee')
          .is('revoked_at', null)
          .single()

        if (error || !data) {
        setOrgInviteStatus('invalid')
        setOrgInviteError('Пригласительная ссылка недействительна или была удалена.')
        return
      }

        if (data.used_at) {
        setOrgInviteStatus('invalid')
        setOrgInviteError('Эта пригласительная ссылка уже была использована.')
        return
      }

        if (data.expires_at && new Date(data.expires_at) < new Date()) {
          setOrgInviteStatus('invalid')
          setOrgInviteError('Срок действия пригласительной ссылки истек.')
          return
        }

        // organization_invite_tokens может быть массивом или объектом
        const orgInviteData = Array.isArray(data.organization_invite_tokens)
          ? data.organization_invite_tokens[0]
          : data.organization_invite_tokens

        setOrgInvite({
          token: data.token,
          organization_id: orgInviteData?.organization_id,
          organization_type: orgInviteData?.organization_type,
          role: orgInviteData?.employee_role,
        })
      setOrgInviteStatus('form')
    } catch (err) {
      console.error('Ошибка проверки пригласительной ссылки сотрудника', err)
      setOrgInviteStatus('invalid')
      setOrgInviteError('Не удалось проверить пригласительную ссылку. Попробуйте позже.')
    }
    }

    validateInvite()
  }, [isOrgInvite, orgToken, clientToken])

  const onSubmit = async (data: RegisterFormData) => {
    if (!token) {
      setError('Регистрация доступна только по пригласительной ссылке')
      return
    }
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
        // Обновляем authStore с сессией (важно для RPC)
        const { setUser, setSession } = useAuthStore.getState()
        if (authData.session) {
          setUser(authData.user)
          setSession(authData.session)
          // Устанавливаем сессию в Supabase клиенте для RPC
          await supabase.auth.setSession({
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
          })
        }
        
        // Если регистрация по пригласительному токену, помечаем токен как использованный
        if (token) {
          console.log('[RegisterPage] Помечаем токен как использованный:', { token, userId: authData.user.id })
          try {
            // Используем RPC функцию для обхода RLS политик
            const { data: marked, error: markUsedError } = await supabase.rpc('mark_invite_token_used', {
              p_token: token,
              p_user_id: authData.user.id,
            })

            if (markUsedError) {
              console.error('[RegisterPage] Ошибка пометки токена как использованного:', markUsedError)
              // Продолжаем, это не критично
            } else if (marked) {
              console.log('[RegisterPage] ✅ Токен успешно помечен как использованный')
            } else {
              console.warn('[RegisterPage] ⚠️ Токен не найден или уже использован:', token)
            }
          } catch (markErr) {
            console.error('[RegisterPage] Ошибка при пометке токена:', markErr)
          }
        } else {
          console.log('[RegisterPage] Регистрация без токена приглашения')
        }
        
        // Создаем запись в user_profiles через RPC (устанавливаем роль)
        // Полная запись в organizations будет создана в ProfileSetupPage через create_organization
        // Для сиделки тоже используется роль 'organization', так как она является организацией (частной)
        try {
          const role = 'organization' // И для организаций, и для сиделок используется роль 'organization'
          const { error: profileError } = await supabase.rpc('create_user_profile', {
            p_role: role,
          })
          
          if (profileError) {
            console.error('Ошибка создания user_profiles через RPC:', profileError)
            // Продолжаем, это не критично - создастся в ProfileSetupPage
          } else {
            console.log('✅ user_profiles создан с ролью:', role)
          }
        } catch (profileErr) {
          console.error('Ошибка создания user_profiles:', profileErr)
        }
        
        // Проверяем, нужно ли подтверждение email
        if (authData.user.email_confirmed_at) {
          // Email уже подтвержден - обрабатываем pending токены
          try {
            const { data: processResult, error: processError } = await supabase.rpc('process_pending_diary_access', {
              p_user_id: authData.user.id
            })
            
            if (!processError && processResult?.success_count > 0) {
              console.log('[RegisterPage] Обработано pending токенов:', processResult.success_count)
              // Инвалидируем кэш для dashboard
              await queryClient.invalidateQueries({ queryKey: ['dashboard-diaries'] })
            }
          } catch (error) {
            console.error('[RegisterPage] Ошибка обработки pending токенов:', error)
          }
          
          // Переходим к заполнению профиля
        navigate('/profile/setup')
        } else {
          // Email не подтвержден, переходим на страницу подтверждения
          // Pending токены будут обработаны после подтверждения email
          navigate(`/email-confirmation?email=${encodeURIComponent(authData.user.email || '')}`)
        }
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

      // Регистрация ТОЛЬКО через Edge Function accept-invite
      // Edge Function создаст пользователя через admin API, обходя валидацию email
      
      // Используем прямой fetch для лучшей совместимости с CORS
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
      
      // Используем утилиту для получения правильного URL функций
      // Поддерживает как облачный Supabase, так и self-hosted
      const functionUrl = getFunctionUrl('accept-invite')
      
      console.log('Calling Edge Function:', functionUrl)
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          token: orgToken,
          password: data.password,
          phone: phone,
          firstName: '', // Заполняется в ProfileSetupPage
          lastName: '', // Заполняется в ProfileSetupPage
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Edge Function error:', response.status, errorText)
        let errorMessage = 'Не удалось завершить регистрацию. Попробуйте ещё раз.'
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorJson.error || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        
        // Если пользователь уже зарегистрирован (409), предлагаем войти
        if (response.status === 409) {
          errorMessage = 'Пользователь с этим телефоном уже зарегистрирован. Используйте правильный пароль для входа или обратитесь к администратору.'
        }
        
        throw new Error(errorMessage)
      }

      const inviteResult = await response.json()
      
      // Проверяем, есть ли данные для входа (даже если нет сессии, может быть loginEmail)
      if (!inviteResult?.data) {
        throw new Error('Не удалось получить данные после регистрации. Попробуйте войти вручную.')
      }
      
      // Если есть loginEmail, но нет сессии, пытаемся войти через email
      if (inviteResult.data.loginEmail && !inviteResult.data.session) {
        try {
          // Используем email для входа, так как вход по телефону может быть отключен
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: inviteResult.data.loginEmail,
            password: data.password,
          })
          
          if (loginError || !loginData.session) {
            throw new Error('Не удалось войти. Проверьте пароль или обратитесь к администратору.')
          }
          
          // Используем сессию из входа
          const { setUser, setSession, setLoading } = useAuthStore.getState()
          setUser(loginData.user)
          setSession(loginData.session)
          setLoading(false)
          useAuthStore.setState({ isAuthenticated: true })
          
          navigate('/profile/setup')
          return
        } catch (loginErr: any) {
          throw new Error(loginErr.message || 'Не удалось войти. Попробуйте войти вручную.')
        }
      }
      
      if (!inviteResult?.data?.session) {
        throw new Error('Не удалось получить сессию после регистрации. Попробуйте войти вручную.')
      }

      // Устанавливаем сессию в Supabase клиенте
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: inviteResult.data.session.access_token,
        refresh_token: inviteResult.data.session.refresh_token,
      })
      
      console.log('Session set, sessionError:', sessionError)

      if (sessionError) {
        console.error('Ошибка установки сессии:', sessionError)
        throw new Error('Не удалось установить сессию. Попробуйте войти вручную.')
      }

      // Получаем текущего пользователя и сессию
      // ВАЖНО: Обновляем пользователя чтобы получить актуальные user_metadata из Edge Function
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
      const { data: { session: currentSession } } = await supabase.auth.getSession()

      if (userError || !currentUser) {
        console.error('Ошибка получения пользователя:', userError)
        throw new Error('Не удалось получить данные пользователя. Попробуйте войти вручную.')
      }
      
      // Обновляем пользователя чтобы получить актуальные user_metadata
      // Это нужно, чтобы user_metadata содержал role и organization_id из Edge Function
      const { data: { user: refreshedUser } } = await supabase.auth.getUser()
      const finalUser = refreshedUser || currentUser
      
      console.log('RegisterPage: User metadata after registration:', {
        role: finalUser.user_metadata?.role,
        user_role: finalUser.user_metadata?.user_role,
        organization_id: finalUser.user_metadata?.organization_id,
      })

      // Обновляем authStore напрямую (не через checkAuth, чтобы избежать race condition)
      const { setUser, setSession, setLoading } = useAuthStore.getState()
      if (currentSession && finalUser) {
        console.log('RegisterPage: Setting auth state directly:', {
          userId: finalUser.id,
          email: finalUser.email,
          role: finalUser.user_metadata?.role,
          user_role: finalUser.user_metadata?.user_role,
          organization_id: finalUser.user_metadata?.organization_id,
          hasSession: !!currentSession,
        })
        
        // Устанавливаем состояние напрямую, чтобы избежать проверки localStorage
        // setSession уже устанавливает isAuthenticated, но убедимся
        setUser(finalUser)
        setSession(currentSession)
        setLoading(false)
        
        // Дополнительно убеждаемся, что isAuthenticated установлен
        useAuthStore.setState({ 
          isAuthenticated: true,
          loading: false,
        })
        
        console.log('RegisterPage: Auth state set, isAuthenticated:', useAuthStore.getState().isAuthenticated)
      } else {
        console.error('RegisterPage: Missing session or user:', {
          hasSession: !!currentSession,
          hasUser: !!finalUser,
        })
      }

      console.log('✅ Регистрация сотрудника завершена успешно')
      console.log('Final auth state:', {
        isAuthenticated: useAuthStore.getState().isAuthenticated,
        hasUser: !!useAuthStore.getState().user,
        hasSession: !!useAuthStore.getState().session,
        userRole: useAuthStore.getState().user?.user_metadata?.role,
        userRoleAlt: useAuthStore.getState().user?.user_metadata?.user_role,
        organizationId: useAuthStore.getState().user?.user_metadata?.organization_id,
      })
      
      // Небольшая задержка перед навигацией, чтобы состояние точно обновилось
      await new Promise(resolve => setTimeout(resolve, 200))

      // Обрабатываем pending токены доступа к дневникам через бэкенд
      if (finalUser?.id) {
        try {
          const { data: processResult, error: processError } = await supabase.rpc('process_pending_diary_access', {
            p_user_id: finalUser.id
          })
          
          if (!processError && processResult?.success_count > 0) {
            console.log('[RegisterPage] Обработано pending токенов:', processResult.success_count)
            // Инвалидируем кэш для dashboard
            await queryClient.invalidateQueries({ queryKey: ['dashboard-diaries'] })
          }
        } catch (error) {
          console.error('[RegisterPage] Ошибка обработки pending токенов:', error)
        }
      }

      navigate('/profile/setup')
    } catch (err: any) {
      console.error('Ошибка регистрации по приглашению организации', err)
      setOrgInviteError(err.message || 'Не удалось завершить регистрацию. Попробуйте ещё раз.')
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
          <p className="text-gray-600 text-sm mb-4">
            {error || 'Эта ссылка для регистрации недействительна или уже использована.'}
          </p>
          <p className="text-gray-600 text-sm mb-4">
            Для регистрации необходимо записаться на закрытое тестирование.
          </p>
          <p className="text-gray-600 text-sm mb-6">
            Свяжитесь с нами в WhatsApp, и мы отправим вам пригласительную ссылку для доступа к платформе.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <a
            href={`https://wa.me/79145391376?text=${encodeURIComponent('Здравствуйте! Хочу записаться на закрытое тестирование Дневника подопечного. Нужна пригласительная ссылка для регистрации.')}`}
            target="_blank"
            rel="noreferrer"
            className="w-full"
          >
            <Button 
              fullWidth 
              size="lg"
              className="bg-gradient-to-r from-[#25D366] to-[#128C7E] hover:from-[#20BA5A] hover:to-[#0F7A6D] text-white border-0 shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              Связаться с нами в WhatsApp
            </Button>
          </a>
          <Button onClick={() => navigate('/login')} size="lg" fullWidth variant="outline">
            Войти в систему
          </Button>
          <Button onClick={() => navigate('/')} size="lg" fullWidth variant="outline">
            На главную
          </Button>
        </div>
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

  // Если нет пригласительного токена и это не приглашение сотрудника — блокируем регистрацию
  if (!hasInviteToken && !isOrgInvite) {
    return (
      <div className="text-center">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-dark mb-3">Регистрация по приглашению</h1>
          <p className="text-gray-600 text-sm mb-4">
            Для регистрации необходимо записаться на закрытое тестирование.
          </p>
          <p className="text-gray-600 text-sm mb-4">
            Свяжитесь с нами в WhatsApp, и мы отправим вам пригласительную ссылку для доступа к платформе.
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Если у вас уже есть аккаунт, вы можете{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-blue-primary font-semibold underline decoration-1 hover:text-blue-600"
            >
              войти в систему
            </button>
            .
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <a
            href={`https://wa.me/79145391376?text=${encodeURIComponent('Здравствуйте! Хочу записаться на закрытое тестирование Дневника подопечного. Нужна пригласительная ссылка для регистрации.')}`}
            target="_blank"
            rel="noreferrer"
            className="w-full"
          >
            <Button 
              fullWidth 
              size="lg"
              className="bg-gradient-to-r from-[#25D366] to-[#128C7E] hover:from-[#20BA5A] hover:to-[#0F7A6D] text-white border-0 shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              Связаться с нами в WhatsApp
            </Button>
          </a>
          <Button onClick={() => navigate('/login')} size="lg" fullWidth variant="outline">
            Войти в систему
          </Button>
          <Button onClick={() => navigate('/')} size="lg" fullWidth variant="outline">
            На главную
          </Button>
        </div>
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

