import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { translateError } from '@/lib/errorMessages'
import { Button, Input } from '@/components/ui'

// Схема валидации для кода подтверждения
const confirmationSchema = z.object({
  code: z.string().min(8, 'Код должен содержать 8 символов').max(8, 'Код должен содержать 8 символов'),
})

type ConfirmationFormData = z.infer<typeof confirmationSchema>

export const EmailConfirmationPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const email = searchParams.get('email') || user?.email || ''
  
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmationFormData>({
    resolver: zodResolver(confirmationSchema),
  })

  // Проверяем, подтвержден ли уже email (если пользователь авторизован)
  useEffect(() => {
    const checkEmailConfirmation = async () => {
      // Если пользователь авторизован и email уже подтвержден, перенаправляем
      if (user && user.email_confirmed_at) {
        navigate('/profile/setup')
      }
    }

    checkEmailConfirmation()
  }, [user, navigate])

  const onSubmit = async (data: ConfirmationFormData) => {
    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Подтверждение email через Supabase
      const { data: confirmData, error: confirmError } = await supabase.auth.verifyOtp({
        email: email,
        token: data.code,
        type: 'email',
      })

      if (confirmError) {
        throw confirmError
      }

      if (confirmData.user) {
        setSuccessMessage('Email успешно подтвержден!')
        
        // ВАЖНО: Очищаем localStorage перед обновлением сессии
        // Это нужно, чтобы не было конфликта со старыми данными сотрудников
        // НЕ удаляем local_invite_tokens и local_employees - они нужны для работы с сотрудниками
        localStorage.removeItem('current_user')
        localStorage.removeItem('auth_token')
        
        // Обновляем сессию в store
        const { setSession, checkAuth } = useAuthStore.getState()
        const { data: { session } } = await supabase.auth.getSession()
        
        // ВАЖНО: После подтверждения email сессия должна быть создана
        if (session) {
          setSession(session)
          // Проверяем авторизацию еще раз, чтобы убедиться, что все обновлено
          await checkAuth()
          
          // Обрабатываем pending токены доступа к дневникам через бэкенд
          if (session.user?.id) {
            try {
              const { data: processResult, error: processError } = await supabase.rpc('process_pending_diary_access', {
                p_user_id: session.user.id
              })
              
              if (!processError && processResult?.success_count > 0) {
                console.log('[EmailConfirmationPage] Обработано pending токенов:', processResult.success_count)
                // Инвалидируем кэш для dashboard
                await queryClient.invalidateQueries({ queryKey: ['dashboard-diaries'] })
              }
            } catch (error) {
              console.error('[EmailConfirmationPage] Ошибка обработки pending токенов:', error)
            }
          }
          
          // Перенаправление на заполнение профиля через небольшую задержку
          setTimeout(() => {
            navigate('/profile/setup', { replace: true })
          }, 1500)
        } else {
          // Если сессия не создана, это ошибка
          throw new Error('Не удалось создать сессию после подтверждения email')
        }
      }
    } catch (err: any) {
      setError(translateError(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (!email) {
      setError('Email не указан')
      return
    }

    setIsResending(true)
    setError(null)

    try {
      // Отправка нового кода подтверждения
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      })

      if (resendError) {
        throw resendError
      }

      setSuccessMessage('Код подтверждения отправлен на вашу почту!')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      setError(translateError(err))
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-[32px] font-bold text-gray-dark mb-2 text-center">
        Подтверждение email
      </h1>
      <p className="text-gray-600 mb-8 text-center text-sm font-manrope">
        Мы отправили код подтверждения на вашу почту
      </p>

      {email && (
        <p className="text-center text-sm font-manrope text-gray-600 mb-6">
          {email}
        </p>
      )}

      {successMessage && (
        <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm font-manrope text-green-600">{successMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Input
          label="Введите код подтверждения"
          placeholder="00000000"
          maxLength={8}
          error={errors.code?.message}
          fullWidth
          className="text-center text-2xl tracking-widest font-mono"
          {...register('code')}
        />

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm font-manrope text-red-600">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          fullWidth
          isLoading={isLoading}
          size="lg"
        >
          Подтвердить
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleResendCode}
            disabled={isResending}
            className="text-sm font-manrope text-blue-primary hover:text-blue-600 underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResending ? 'Отправка...' : 'Отправить код повторно'}
          </button>
        </div>
      </form>
    </div>
  )
}

