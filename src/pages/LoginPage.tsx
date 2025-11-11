import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
  const [searchParams] = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const employeeId = searchParams.get('employee_id')
  const clientId = searchParams.get('client_id')

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // Если есть employee_id или client_id в URL, автоматически заполняем телефон
  useEffect(() => {
    if (employeeId) {
      try {
        const employees = JSON.parse(localStorage.getItem('local_employees') || '[]')
        const employee = employees.find((e: any) => e.user_id === employeeId)
        if (employee?.phone) {
          setValue('login', employee.phone)
          return
        }
      } catch (err) {
        console.log('Could not find employee', err)
      }
    }

    if (clientId) {
      try {
        const clients = JSON.parse(localStorage.getItem('local_clients') || '[]')
        const client = clients.find((c: any) => c.user_id === clientId)
        if (client?.phone) {
          setValue('login', client.phone)
        } else {
          const users = JSON.parse(localStorage.getItem('local_users') || '[]')
          const clientUser = users.find((u: any) => u.id === clientId)
          if (clientUser?.phone) {
            setValue('login', clientUser.phone)
          }
        }
      } catch (err) {
        console.log('Could not find client', err)
      }
    }
  }, [employeeId, clientId, setValue])

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setError(null)

    try {
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
            
            // Перенаправление на главную страницу
            navigate('/dashboard')
          }
        } catch (err: any) {
          setError(translateError(err))
        } finally {
          setIsLoading(false)
        }
      } else {
        // Вход по телефону (для сотрудников) - через localStorage
        // ВАЖНО: Очищаем Supabase сессию перед входом сотрудника (чтобы не было конфликта)
        try {
          await supabase.auth.signOut()
        } catch (err) {
          // Игнорируем ошибку
        }
        
        // Форматируем телефон в международный формат
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

        // Ищем пользователя в localStorage
        const users = JSON.parse(localStorage.getItem('local_users') || '[]')
        const user = users.find((u: any) => u.phone === formattedPhone && u.password === data.password)

        if (!user) {
          setError('Неверный телефон или пароль')
          setIsLoading(false)
          return
        }

        // Создаем сессию
        const userData = {
          id: user.id,
          phone: user.phone,
          user_role: user.user_role,
          organization_id: user.organization_id,
          employee_role: user.employee_role,
          email_confirmed_at: user.email_confirmed_at,
        }

        console.log('Logging in as employee:', userData.id, 'organization_id:', userData.organization_id)

        // Сохраняем текущую сессию
        localStorage.setItem('current_user', JSON.stringify(userData))
        localStorage.setItem('auth_token', `token_${user.id}`)

        // Обновляем authStore
        const { setUser, setSession } = useAuthStore.getState()
        setUser(userData as any)
        setSession({
          user: userData,
          access_token: `token_${user.id}`,
          refresh_token: `refresh_${user.id}`,
        } as any)

        // Перенаправление на главную страницу
        navigate('/dashboard')
        setIsLoading(false)
      }
    } catch (err: any) {
      setError(translateError(err))
      setIsLoading(false)
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

