import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { translateError } from '@/lib/errorMessages'
import { Button, Input } from '@/components/ui'

// Схема валидации для входа (поддерживает email или телефон)
const loginSchema = z.object({
  login: z.string().min(1, 'Введите email или номер телефона'),
  password: z.string().min(1, 'Введите пароль'),
})

type LoginFormData = z.infer<typeof loginSchema>

export const LoginPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // const [searchParams] = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // const employeeId = searchParams.get('employee_id')
  // const clientId = searchParams.get('client_id')

  const {
    register,
    handleSubmit,
    formState: { errors },
    // setValue,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // Убрано: автоматическое заполнение телефона из localStorage (все через бэкенд)

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setError(null)

    // Определяем, является ли вход email или телефоном
    const isEmail = data.login.includes('@')
    
    if (isEmail) {
      // Вход по email (для организаций и сиделок) - через Supabase
      try {
        // ВАЖНО: Очищаем localStorage перед входом через Supabase (чтобы не было конфликта)
        // Это критично для работы в одном браузере!
        localStorage.removeItem('current_user')
        localStorage.removeItem('auth_token')
        
        // Также выходим из возможной Supabase сессии сотрудника
        try {
          await supabase.auth.signOut()
        } catch (err) {
          // Игнорируем ошибку
        }
        
        const result = await supabase.auth.signInWithPassword({
          email: data.login,
          password: data.password,
        })

        if (result.error) {
          throw result.error
        }

        if (result.data.user) {
          // Обновляем authStore
          const { setUser, setSession } = useAuthStore.getState()
          setUser(result.data.user)
          setSession(result.data.session)
          
          console.log('Logged in as organization:', result.data.user.email)
          
          // Обрабатываем pending токены доступа к дневникам через бэкенд
          try {
            const { data: processResult, error: processError } = await supabase.rpc('process_pending_diary_access', {
              p_user_id: result.data.user.id
            })
            
              if (!processError && processResult?.success_count > 0) {
                console.log('[LoginPage] Обработано pending токенов:', processResult.success_count)
                // Инвалидируем кэш для dashboard
                await queryClient.invalidateQueries({ queryKey: ['dashboard-diaries'] })
              }
          } catch (error) {
            console.error('[LoginPage] Ошибка обработки pending токенов:', error)
          }
          
          // Перенаправление на главную страницу
          navigate('/dashboard')
        }
      } catch (err: any) {
        setError(translateError(err))
      } finally {
        setIsLoading(false)
      }
    } else {
      // Вход по телефону (для сотрудников и клиентов) - через Supabase
      try {
        // Форматируем телефон в email формат (organization_employee-xxx@diary.local)
        let formattedPhone = data.login.trim().replace(/\s/g, '')
        if (!formattedPhone.startsWith('+')) {
          if (formattedPhone.startsWith('7')) {
            formattedPhone = '+' + formattedPhone
          } else if (formattedPhone.startsWith('8')) {
            formattedPhone = '+7' + formattedPhone.substring(1)
          } else {
            formattedPhone = '+7' + formattedPhone.replace(/\D/g, '')
          }
        }
        
        // Нормализуем телефон (убираем все кроме цифр)
        const sanitizedPhone = formattedPhone.replace(/[^0-9]/g, '')
        
        console.log('LoginPage: Phone normalization:', {
          original: data.login,
          formatted: formattedPhone,
          sanitized: sanitizedPhone,
        })
        
        // Сначала пытаемся найти пользователя по телефону через RPC
        try {
          console.log('LoginPage: Searching user by phone:', sanitizedPhone)
          const { data: userData, error: findError } = await supabase.rpc('find_user_email_by_phone', {
            p_phone: sanitizedPhone
          })
          
          if (findError) {
            console.error('LoginPage: RPC find_user_email_by_phone error:', findError)
          } else {
            console.log('LoginPage: RPC find_user_email_by_phone result:', userData)
          }
          
          if (!findError && userData && userData.length > 0) {
            const foundUser = userData[0]
            console.log('LoginPage: ✅ Found user by phone:', {
              user_id: foundUser.user_id,
              email: foundUser.email,
              user_role: foundUser.user_role,
              organization_type: foundUser.organization_type
            })
            
            // Пытаемся войти с найденным email
            const result = await supabase.auth.signInWithPassword({
              email: foundUser.email,
              password: data.password,
            })
            
            if (!result.error && result.data.user) {
              console.log('LoginPage: ✅ Successfully logged in as:', result.data.user.email)
              // Обновляем authStore
              const { setUser, setSession } = useAuthStore.getState()
              setUser(result.data.user)
              setSession(result.data.session)
              
              // Обрабатываем pending токены доступа к дневникам через бэкенд
              try {
                const { data: processResult, error: processError } = await supabase.rpc('process_pending_diary_access', {
                  p_user_id: result.data.user.id
                })
                
                if (!processError && processResult?.success_count > 0) {
                  console.log('[LoginPage] Обработано pending токенов:', processResult.success_count)
                  // Инвалидируем кэш для dashboard, чтобы дневники появились
                  await queryClient.invalidateQueries({ queryKey: ['dashboard-diaries'] })
                }
              } catch (error) {
                console.error('[LoginPage] Ошибка обработки pending токенов:', error)
              }
              
              // Перенаправление на главную страницу
              navigate('/dashboard')
              return
            } else {
              // Пользователь найден, но пароль неверный
              console.error('LoginPage: ❌ User found but password incorrect:', result.error)
              throw result.error || new Error('Неверный пароль')
            }
          } else {
            console.log('LoginPage: No user found by phone, trying fallback method')
          }
        } catch (rpcError: any) {
          console.error('LoginPage: RPC find_user_email_by_phone exception:', rpcError)
          // Продолжаем с fallback методом
        }
        
        // Если RPC не нашел пользователя, пробуем старый способ (для обратной совместимости)
        // Пробуем разные варианты формата (администратор, сотрудник, клиент организации, клиент сиделки)
        const emailVariants = [
          `admin-${sanitizedPhone}@diary.local`,
          `organization_employee-${sanitizedPhone}@diary.local`,
          `organization_client-${sanitizedPhone}@diary.local`,
          `caregiver_client-${sanitizedPhone}@diary.local`,
        ]
        
        console.log('LoginPage: Trying email variants (fallback):', emailVariants)
        
        let lastError: any = null
        for (const email of emailVariants) {
          try {
            console.log('LoginPage: Attempting login with:', email)
            const result = await supabase.auth.signInWithPassword({
              email: email,
              password: data.password,
            })
            
            if (!result.error) {
              // Успешный вход
              if (result.data.user) {
                console.log('LoginPage: ✅ Successfully logged in as:', result.data.user.email)
                // Обновляем authStore
                const { setUser, setSession } = useAuthStore.getState()
                setUser(result.data.user)
                setSession(result.data.session)
                
                // Обрабатываем pending токены доступа к дневникам через бэкенд
                try {
                  const { data: processResult, error: processError } = await supabase.rpc('process_pending_diary_access', {
                    p_user_id: result.data.user.id
                  })
                  
                  if (!processError && processResult?.success_count > 0) {
                    console.log('[LoginPage] Обработано pending токенов:', processResult.success_count)
                    // Инвалидируем кэш для dashboard, чтобы дневники появились
                    await queryClient.invalidateQueries({ queryKey: ['dashboard-diaries'] })
                  }
                } catch (error) {
                  console.error('[LoginPage] Ошибка обработки pending токенов:', error)
                }
                
                // Перенаправление на главную страницу
                navigate('/dashboard')
                return
              }
            } else {
              console.log('LoginPage: ❌ Login failed with', email, ':', result.error.message)
              lastError = result.error
            }
          } catch (err: any) {
            console.log('LoginPage: ❌ Exception with', email, ':', err.message)
            lastError = err
          }
        }
        
        // Если ни один вариант не сработал, показываем ошибку
        if (lastError) {
          console.error('LoginPage: All login attempts failed, last error:', lastError)
          throw lastError
        }
      } catch (err: any) {
        setError(translateError(err))
      } finally {
        setIsLoading(false)
      }
    }
  }

  return (
    <div>
      <h1 className="text-[32px] font-bold text-gray-dark mb-10 text-center">
        Войти
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
        <Input
          label="Введите email или номер телефона"
          type="text"
          placeholder="Email или номер телефона"
          error={errors.login?.message}
          fullWidth
          {...register('login')}
        />

        <Input
          label="Введите пароль"
          type="password"
          placeholder="Пароль"
          error={errors.password?.message}
          fullWidth
          {...register('password')}
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
          className="mt-6"
        >
          Войти
        </Button>

        <p className="text-center text-sm font-manrope text-gray-600 mt-6 leading-relaxed">
          Если еще нет аккаунта, нажмите{' '}
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="text-gray-dark font-semibold underline decoration-1"
          >
            Регистрация
          </button>
        </p>
      </form>
    </div>
  )
}

