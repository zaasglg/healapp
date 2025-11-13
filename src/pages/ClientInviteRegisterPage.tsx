import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
// Убрано: импорты localStorage утилит (все через бэкенд)

// Убрано: DiaryRecord (теперь используется тип из Supabase)

const clientRegisterSchema = z
  .object({
    phone: z.string().min(10, 'Введите телефон'),
    password: z.string().min(6, 'Пароль должен быть не менее 6 символов'),
    confirmPassword: z.string().min(1, 'Подтвердите пароль'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })

type ClientRegisterFormData = z.infer<typeof clientRegisterSchema>

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

// Убрано: createClientId и validateInvite (теперь все через бэкенд)

export const ClientInviteRegisterPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setUser } = useAuthStore()
  const diaryId = searchParams.get('diary') || ''
  const token = searchParams.get('token') || ''
  // flowType будет определен после валидации токена
  const [flowType, setFlowType] = useState<'organization' | 'caregiver' | null>(null)

  const [status, setStatus] = useState<'loading' | 'invalid' | 'form' | 'processing'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [inviteData, setInviteData] = useState<any | null>(null)
  const [diaryInfo, setDiaryInfo] = useState<any | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientRegisterFormData>({
    resolver: zodResolver(clientRegisterSchema),
  })

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      setError('Ссылка недействительна. Проверьте корректность приглашения.')
      return
    }

    const validateInvite = async () => {
      try {
        // Используем RPC функцию для валидации токена (обходит RLS)
        console.log('ClientInviteRegisterPage: Validating token via RPC:', token)
        const { data: validationResult, error: rpcError } = await supabase.rpc('validate_invite_token', {
          p_token: token,
        })

        console.log('ClientInviteRegisterPage: RPC result:', { validationResult, rpcError })

        if (rpcError) {
          console.error('ClientInviteRegisterPage: RPC validation error:', rpcError)
          setStatus('invalid')
          setError('Пригласительная ссылка недействительна или была удалена.')
          return
        }

        if (!validationResult) {
          console.error('ClientInviteRegisterPage: RPC returned null/undefined')
          setStatus('invalid')
          setError('Пригласительная ссылка недействительна или была удалена.')
          return
        }

        // Проверяем результат валидации
        if (!validationResult.valid) {
          console.log('ClientInviteRegisterPage: Token validation failed:', validationResult.error)
          setStatus('invalid')
          setError(validationResult.error || 'Пригласительная ссылка недействительна или была удалена.')
          return
        }

        // Определяем тип приглашения по данным токена
        const detectedInviteType = validationResult.invite_type as 'organization_client' | 'caregiver_client'
        
        if (detectedInviteType !== 'organization_client' && detectedInviteType !== 'caregiver_client') {
          setStatus('invalid')
          setError('Неверный тип пригласительной ссылки.')
          return
        }

        if (detectedInviteType === 'organization_client') {
          setFlowType('organization')
        } else if (detectedInviteType === 'caregiver_client') {
          setFlowType('caregiver')
        }

        // Преобразуем результат RPC в формат, ожидаемый компонентом
        // RPC возвращает jsonb, поэтому нужно правильно обработать массивы
        const orgClientTokens = validationResult.organization_client_invite_tokens
        const caregiverTokens = validationResult.caregiver_client_invite_tokens
        
        const inviteData = {
          id: validationResult.id,
          token: validationResult.token,
          invite_type: validationResult.invite_type,
          expires_at: validationResult.expires_at,
          used_at: validationResult.used_at,
          revoked_at: validationResult.revoked_at,
          organization_client_invite_tokens: Array.isArray(orgClientTokens) && orgClientTokens.length > 0
            ? orgClientTokens[0]
            : orgClientTokens || null,
          caregiver_client_invite_tokens: Array.isArray(caregiverTokens) && caregiverTokens.length > 0
            ? caregiverTokens[0]
            : caregiverTokens || null,
        }

        setInviteData(inviteData)

        // Если это приглашение от организации, загружаем информацию о дневнике
        const orgClientInviteData = inviteData.organization_client_invite_tokens
        
        if (detectedInviteType === 'organization_client' && orgClientInviteData?.diary_id) {
          const { data: diary, error: diaryError } = await supabase
            .from('diaries')
            .select(`
              id,
              patient_card_id,
              organization_id,
              caregiver_id,
              owner_client_id
            `)
            .eq('id', orgClientInviteData.diary_id)
            .single()

          if (!diaryError && diary) {
            setDiaryInfo(diary)
          }
        }

        setStatus('form')
      } catch (err) {
        console.error('Ошибка проверки пригласительной ссылки', err)
        setStatus('invalid')
        setError('Не удалось проверить приглашение. Попробуйте позже.')
      }
    }

    validateInvite()
  }, [token]) // flowType теперь state, не нужно в зависимостях

  const handleOrganizationSubmit = async (formData: ClientRegisterFormData) => {
    if (!token || !inviteData) return
    setStatus('processing')
    setError(null)

    const phone = formatPhone(formData.phone)
    if (!phone) {
      setError('Введите корректный номер телефона')
      setStatus('form')
      return
    }

    try {
      // Регистрация ТОЛЬКО через Edge Function accept-invite (как для сотрудников)
      // Edge Function создаст пользователя через admin API, обходя валидацию email
      
      // Используем прямой fetch для лучшей совместимости с CORS
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
      
      const baseUrl = supabaseUrl.replace(/\/$/, '')
      const functionUrl = `${baseUrl}/functions/v1/accept-invite`
      
      console.log('ClientInviteRegisterPage: Calling Edge Function:', functionUrl)
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          token: token,
          password: formData.password,
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
        throw new Error(errorMessage)
      }

      const inviteResult = await response.json()
      
      if (!inviteResult?.data?.session) {
        throw new Error('Не удалось получить сессию после регистрации. Попробуйте войти вручную.')
      }

      // Устанавливаем сессию в Supabase клиенте
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: inviteResult.data.session.access_token,
        refresh_token: inviteResult.data.session.refresh_token,
      })
      
      if (sessionError) {
        console.error('Ошибка установки сессии:', sessionError)
        throw new Error('Не удалось установить сессию. Попробуйте войти вручную.')
      }

      // Получаем текущего пользователя и сессию
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
      const { data: { session: currentSession } } = await supabase.auth.getSession()

      if (userError || !currentUser) {
        console.error('Ошибка получения пользователя:', userError)
        throw new Error('Не удалось получить данные пользователя. Попробуйте войти вручную.')
      }

      // Обновляем authStore напрямую
      const { setUser, setSession, setLoading } = useAuthStore.getState()
      if (currentSession && currentUser) {
        setUser(currentUser)
        setSession(currentSession)
        setLoading(false)
        
        useAuthStore.setState({ 
          isAuthenticated: true,
          loading: false,
        })
      }

      console.log('✅ Регистрация клиента организации завершена успешно')
      
      // Небольшая задержка перед навигацией
      await new Promise(resolve => setTimeout(resolve, 200))
      
      navigate('/profile/setup')
    } catch (err: any) {
      console.error('Ошибка регистрации клиента организации', err)
      setError(err.message || 'Не удалось завершить регистрацию. Попробуйте ещё раз.')
      setStatus('form')
    }
  }

  const handleCaregiverSubmit = async (formData: ClientRegisterFormData) => {
    if (!token || !inviteData) return
    setStatus('processing')
    setError(null)

    const phone = formatPhone(formData.phone)
    if (!phone) {
      setError('Введите корректный номер телефона')
      setStatus('form')
      return
    }

    try {
      // Регистрация ТОЛЬКО через Edge Function accept-invite (как для сотрудников)
      // Edge Function создаст пользователя через admin API, обходя валидацию email
      
      // Используем прямой fetch для лучшей совместимости с CORS
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
      
      const baseUrl = supabaseUrl.replace(/\/$/, '')
      const functionUrl = `${baseUrl}/functions/v1/accept-invite`
      
      console.log('ClientInviteRegisterPage: Calling Edge Function for caregiver:', functionUrl)
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          token: token,
          password: formData.password,
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
        throw new Error(errorMessage)
      }

      const inviteResult = await response.json()
      
      if (!inviteResult?.data?.session) {
        throw new Error('Не удалось получить сессию после регистрации. Попробуйте войти вручную.')
      }

      // Устанавливаем сессию в Supabase клиенте
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: inviteResult.data.session.access_token,
        refresh_token: inviteResult.data.session.refresh_token,
      })
      
      if (sessionError) {
        console.error('Ошибка установки сессии:', sessionError)
        throw new Error('Не удалось установить сессию. Попробуйте войти вручную.')
      }

      // Получаем текущего пользователя и сессию
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
      const { data: { session: currentSession } } = await supabase.auth.getSession()

      if (userError || !currentUser) {
        console.error('Ошибка получения пользователя:', userError)
        throw new Error('Не удалось получить данные пользователя. Попробуйте войти вручную.')
      }

      // Обновляем authStore напрямую
      const { setUser, setSession, setLoading } = useAuthStore.getState()
      if (currentSession && currentUser) {
        setUser(currentUser)
        setSession(currentSession)
        setLoading(false)
        
        useAuthStore.setState({ 
          isAuthenticated: true,
          loading: false,
        })
      }

      console.log('✅ Регистрация клиента сиделки завершена успешно')
      
      // Небольшая задержка перед навигацией
      await new Promise(resolve => setTimeout(resolve, 200))
      
      navigate('/profile/setup')
    } catch (err: any) {
      console.error('Ошибка регистрации клиента сиделки', err)
      setError(err.message || 'Не удалось завершить регистрацию. Попробуйте ещё раз.')
      setStatus('form')
    }
  }

  if (status === 'loading') {
    return (
      <div className="space-y-4 text-center">
        <div className="animate-spin w-12 h-12 border-4 border-[#7DD3DC] border-t-transparent rounded-full mx-auto"></div>
        <p className="text-gray-600 text-sm">Проверяем приглашение...</p>
      </div>
    )
  }

  if (status === 'invalid' && error) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3 text-center">
          <h1 className="text-xl font-semibold text-gray-dark">Ссылка недоступна</h1>
          <p className="text-sm text-gray-600 leading-relaxed">{error}</p>
        </div>
        <Button onClick={() => navigate('/login')} fullWidth>
          Перейти ко входу
        </Button>
      </div>
    )
  }

  // Показываем форму только если flowType определен
  if (!flowType || !inviteData) {
    return (
      <div className="space-y-4 text-center">
        <div className="animate-spin w-12 h-12 border-4 border-[#7DD3DC] border-t-transparent rounded-full mx-auto"></div>
        <p className="text-gray-600 text-sm">Загрузка...</p>
      </div>
    )
  }

  if (flowType === 'caregiver') {

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3 text-center">
          <h1 className="text-2xl font-semibold text-gray-dark">Регистрация клиента</h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            После регистрации вы сможете создать карточку подопечного и вести дневник вместе с приглашавшим специалистом.
          </p>
          {inviteData?.caregiver_client_invite_tokens?.invited_client_name && (
            <p className="text-sm text-[#4A4A4A]/70">
              Пригласил: {inviteData.caregiver_client_invite_tokens.invited_client_name}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit(handleCaregiverSubmit)} className="bg-white rounded-3xl shadow-sm p-6 space-y-5">
          <Input
            label="Телефон"
            placeholder="+7 (___) ___-__-__"
            error={errors.phone?.message}
            fullWidth
            {...register('phone')}
          />
          <Input
            label="Пароль"
            type="password"
            placeholder="Введите пароль"
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
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          <Button type="submit" fullWidth isLoading={status === 'processing'}>
            Завершить регистрацию
          </Button>
        </form>

        <div className="bg-white rounded-3xl shadow-sm p-5 space-y-3 text-sm text-gray-600">
          <p className="text-center text-gray-500">
            Если регистрация уже выполнена, войдите с помощью телефона и пароля на странице входа.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate('/login')}
            fullWidth
          >
            Перейти ко входу
          </Button>
        </div>
      </div>
    )
  }

  if (!inviteData || !diaryInfo) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3 text-center">
        <h1 className="text-2xl font-semibold text-gray-dark">
          Регистрация клиента
        </h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          После регистрации вы получите доступ к дневнику и сможете управлять правами доступа.
        </p>
      </div>

      <form onSubmit={handleSubmit(handleOrganizationSubmit)} className="bg-white rounded-3xl shadow-sm p-6 space-y-5">
        <Input
          label="Телефон"
          placeholder="+7 (___) ___-__-__"
          error={errors.phone?.message}
          fullWidth
          {...register('phone')}
        />
        <Input
          label="Пароль"
          type="password"
          placeholder="Введите пароль"
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
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        <Button type="submit" fullWidth isLoading={status === 'processing'}>
          Завершить регистрацию
        </Button>
      </form>

      <div className="bg-white rounded-3xl shadow-sm p-5 space-y-3 text-sm text-gray-600">
        <p className="text-center text-gray-500">
          Если регистрация уже выполнена, войдите с помощью телефона и пароля на странице входа.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate('/login')}
          fullWidth
        >
          Перейти ко входу
        </Button>
      </div>
    </div>
  )
}


