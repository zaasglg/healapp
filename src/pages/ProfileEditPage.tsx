import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { translateError } from '@/lib/errorMessages'
import { Button, Input } from '@/components/ui'

// Тип организации
type OrganizationType = 'pension' | 'patronage_agency' | 'caregiver'

// Схема валидации для частной сиделки
const caregiverSchema = z.object({
  firstName: z.string().min(1, 'Введите имя'),
  lastName: z.string().min(1, 'Введите фамилию'),
  phone: z.string().min(1, 'Введите номер телефона'),
  city: z.string().min(1, 'Введите город'),
})

// Схема валидации для организации
const organizationSchema = z.object({
  name: z.string().min(1, 'Введите название организации'),
  phone: z.string().min(1, 'Введите номер телефона'),
  address: z.string().min(1, 'Введите адрес организации'),
})

// Схема валидации для сотрудника (только имя и фамилия, телефон уже известен)
const employeeSchema = z.object({
  firstName: z.string().min(1, 'Введите имя'),
  lastName: z.string().min(1, 'Введите фамилию'),
})

// Схема валидации для клиента (только имя и фамилия)
const clientSchema = z.object({
  firstName: z.string().min(1, 'Введите имя'),
  lastName: z.string().min(1, 'Введите фамилию'),
})

type CaregiverFormData = z.infer<typeof caregiverSchema>
type OrganizationFormData = z.infer<typeof organizationSchema>
type EmployeeFormData = z.infer<typeof employeeSchema>
type ClientFormData = z.infer<typeof clientSchema>

export const ProfileEditPage = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [organizationType, setOrganizationType] = useState<OrganizationType | 'employee' | 'client' | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Форма для частной сиделки
  const caregiverForm = useForm<CaregiverFormData>({
    resolver: zodResolver(caregiverSchema),
  })

  // Форма для организации
  const organizationForm = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
  })

  // Форма для сотрудника
  const employeeForm = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
  })

  // Форма для клиента
  const clientForm = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
  })

  // Загрузка данных профиля
  useEffect(() => {
    const loadProfile = async () => {
      if (!user) {
        navigate('/login')
        return
      }

      try {
        // ВАЖНО: Сначала проверяем organization_type (для организаций и сиделок)
        // Это приоритетнее, чем user_role, так как organization_type устанавливается при регистрации
        const userType = user.user_metadata?.organization_type as OrganizationType | undefined
        
        // Если есть organization_type - это организация или сиделка (НЕ сотрудник)
        if (userType && ['pension', 'patronage_agency', 'caregiver'].includes(userType)) {
          setOrganizationType(userType)
          
          // Пытаемся загрузить из БД (с таймаутом)
          try {
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 2000) // 2 секунды таймаут
            )
            
            const dbPromise = supabase
              .from('organizations')
              .select('*')
              .eq('user_id', user.id)
              .single()

            const { data, error: dbError } = await Promise.race([dbPromise, timeoutPromise]) as any

            if (!dbError && data) {
              if (userType === 'caregiver') {
                caregiverForm.reset({
                  firstName: data.first_name || '',
                  lastName: data.last_name || '',
                  phone: data.phone || '',
                  city: data.city || '',
                })
              } else {
                organizationForm.reset({
                  name: data.name || '',
                  phone: data.phone || '',
                  address: data.address || '',
                })
              }
            } else {
              // Если данных в БД нет, используем metadata
              const profileData = user.user_metadata?.profile_data
              if (profileData) {
                if (userType === 'caregiver') {
                  caregiverForm.reset({
                    firstName: profileData.firstName || '',
                    lastName: profileData.lastName || '',
                    phone: profileData.phone || '',
                    city: profileData.city || '',
                  })
                } else {
                  organizationForm.reset({
                    name: profileData.name || '',
                    phone: profileData.phone || '',
                    address: profileData.address || '',
                  })
                }
              }
            }
          } catch (err) {
            // Если таблицы нет, используем metadata
            const profileData = user.user_metadata?.profile_data
            if (profileData) {
              if (userType === 'caregiver') {
                caregiverForm.reset({
                  firstName: profileData.firstName || '',
                  lastName: profileData.lastName || '',
                  phone: profileData.phone || '',
                  city: profileData.city || '',
                })
              } else {
                organizationForm.reset({
                  name: profileData.name || '',
                  phone: profileData.phone || '',
                  address: profileData.address || '',
                })
              }
            }
          }
          setIsLoadingProfile(false)
          return
        }

        // Только если organization_type отсутствует, проверяем user_role (для сотрудников и клиентов)
        // Для сотрудников и клиентов из localStorage user_role может быть напрямую в user
        const userRole = (user as any).user_role || user.user_metadata?.user_role as string | undefined
        
        // КЛИЕНТ: проверяем первым (приоритет перед сотрудниками)
        if (userRole === 'client') {
          setOrganizationType('client')
          
          // Загружаем данные клиента из localStorage
          try {
            const clients = JSON.parse(localStorage.getItem('local_clients') || '[]')
            const clientData = clients.find((c: any) => c.user_id === user.id)
            
            if (clientData) {
              clientForm.reset({
                firstName: clientData.first_name || '',
                lastName: clientData.last_name || '',
              })
              setIsLoadingProfile(false)
              return
            }
          } catch (err) {
            console.log('Error loading client from localStorage:', err)
          }

          // Если нет в local_clients, проверяем profile_data из current_user
          try {
            const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
            if (currentUser.profile_data) {
              clientForm.reset({
                firstName: currentUser.profile_data.firstName || '',
                lastName: currentUser.profile_data.lastName || '',
              })
              setIsLoadingProfile(false)
              return
            }
          } catch (err) {
            console.log('Error loading client from current_user:', err)
          }
          
          // Если данных нет, устанавливаем пустые значения
          clientForm.reset({
            firstName: '',
            lastName: '',
          })
          setIsLoadingProfile(false)
          return
        }
        
        if (userRole === 'org_employee') {
          setOrganizationType('employee')
          
          // Сначала проверяем localStorage (для фронтенд-решения)
          try {
            const employees = JSON.parse(localStorage.getItem('local_employees') || '[]')
            const employeeData = employees.find((e: any) => e.user_id === user.id)
            
            if (employeeData) {
              employeeForm.reset({
                firstName: employeeData.first_name || '',
                lastName: employeeData.last_name || '',
              })
              setIsLoadingProfile(false)
              return
            }
          } catch (err) {
            console.log('Error loading from localStorage:', err)
          }

          // Если нет в localStorage, проверяем profile_data из current_user
          try {
            const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
            if (currentUser.profile_data) {
              employeeForm.reset({
                firstName: currentUser.profile_data.firstName || '',
                lastName: currentUser.profile_data.lastName || '',
              })
              setIsLoadingProfile(false)
              return
            }
          } catch (err) {
            console.log('Error loading from current_user:', err)
          }

          // Пытаемся загрузить из БД (с таймаутом)
          try {
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 2000) // 2 секунды таймаут
            )
            
            const dbPromise = supabase
              .from('organization_employees')
              .select('*')
              .eq('user_id', user.id)
              .single()

            const { data, error: dbError } = await Promise.race([dbPromise, timeoutPromise]) as any

            if (!dbError && data) {
              employeeForm.reset({
                firstName: data.first_name || '',
                lastName: data.last_name || '',
              })
            } else {
              // Если данных в БД нет, используем metadata
              const profileData = user.user_metadata?.profile_data || (user as any).profile_data
              if (profileData) {
                employeeForm.reset({
                  firstName: profileData.firstName || '',
                  lastName: profileData.lastName || '',
                })
              }
            }
          } catch (err) {
            // Если таблицы нет, используем metadata
            const profileData = user.user_metadata?.profile_data || (user as any).profile_data
            if (profileData) {
              employeeForm.reset({
                firstName: profileData.firstName || '',
                lastName: profileData.lastName || '',
              })
            }
          }
          setIsLoadingProfile(false)
          return
        }
      } catch (err: any) {
        setError(translateError(err))
      } finally {
        setIsLoadingProfile(false)
      }
    }

    loadProfile()
  }, [user, navigate, caregiverForm, organizationForm, employeeForm, clientForm])

  const onSubmitCaregiver = async (data: CaregiverFormData) => {
    if (!user || !organizationType) return

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Пытаемся сохранить в БД (если таблица существует)
      try {
        const { error: updateError } = await supabase
          .from('organizations')
          .update({
            first_name: data.firstName,
            last_name: data.lastName,
            name: `${data.firstName} ${data.lastName}`,
            phone: data.phone,
            city: data.city,
          })
          .eq('user_id', user.id)

        if (updateError) {
          throw updateError
        }

        setSuccessMessage('Профиль успешно обновлен!')
        
        // Редирект на страницу настроек профиля через 2 секунды
        setTimeout(() => {
          navigate('/profile')
        }, 2000)
      } catch (dbError: any) {
        // Если таблицы нет, сохраняем в metadata (для фронтенда)
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            profile_data: {
              firstName: data.firstName,
              lastName: data.lastName,
              phone: data.phone,
              city: data.city,
            },
          },
        })

        if (updateError) {
          throw updateError
        }

        setSuccessMessage('Профиль успешно обновлен!')
        
        // Редирект на страницу настроек профиля через 2 секунды
        setTimeout(() => {
          navigate('/profile')
        }, 2000)
      }
    } catch (err: any) {
      setError(translateError(err))
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitClient = async (data: ClientFormData) => {
    if (!user) return

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Получаем caregiver_id и organization_id из user
      const caregiverId = (user as any).caregiver_id || user.user_metadata?.caregiver_id || null
      const organizationId = (user as any).organization_id || user.user_metadata?.organization_id || null
      const phone = (user as any).phone || user.user_metadata?.phone || null

      // Сохраняем в localStorage (для фронтенда)
      const clients = JSON.parse(localStorage.getItem('local_clients') || '[]')
      const existingIndex = clients.findIndex((c: any) => c.user_id === user.id)
      
      const clientData = {
        user_id: user.id,
        caregiver_id: caregiverId,
        organization_id: organizationId,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: phone,
        updated_at: new Date().toISOString(),
      }

      if (existingIndex !== -1) {
        clients[existingIndex] = { ...clients[existingIndex], ...clientData }
      } else {
        clients.push({
          ...clientData,
          created_at: new Date().toISOString(),
        })
      }
      
      localStorage.setItem('local_clients', JSON.stringify(clients))

      // Обновляем текущего пользователя в localStorage
      const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
      currentUser.profile_data = {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: phone,
        caregiver_id: caregiverId,
        organization_id: organizationId,
      }
      localStorage.setItem('current_user', JSON.stringify(currentUser))

      // Обновляем authStore
      const { setUser } = useAuthStore.getState()
      setUser({ ...user, ...currentUser } as any)

      setSuccessMessage('Профиль успешно обновлен!')
      
      // Редирект на страницу профиля через 2 секунды
      setTimeout(() => {
        navigate('/profile')
      }, 2000)
    } catch (err: any) {
      setError(translateError(err))
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitEmployee = async (data: EmployeeFormData) => {
    if (!user) return

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Получаем organization_id
      const orgId = (user as any).organization_id || user.user_metadata?.organization_id || 'temp'
      
      // Получаем телефон из user.phone (из регистрации) или из metadata
      const phone = (user as any).phone || user.user_metadata?.phone_for_login || user.user_metadata?.phone || null

      // Сохраняем в localStorage (для фронтенда)
      const employees = JSON.parse(localStorage.getItem('local_employees') || '[]')
      const existingIndex = employees.findIndex((e: any) => e.user_id === user.id)
      
      const employeeData = {
        user_id: user.id,
        organization_id: orgId,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: phone,
        updated_at: new Date().toISOString(),
      }

      if (existingIndex !== -1) {
        employees[existingIndex] = { ...employees[existingIndex], ...employeeData }
      } else {
        employees.push({
          ...employeeData,
          created_at: new Date().toISOString(),
        })
      }
      
      localStorage.setItem('local_employees', JSON.stringify(employees))

      // Обновляем текущего пользователя в localStorage
      const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
      currentUser.profile_data = {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: phone,
        organization_id: orgId,
      }
      localStorage.setItem('current_user', JSON.stringify(currentUser))

      // Обновляем authStore
      const { setUser } = useAuthStore.getState()
      setUser({ ...user, ...currentUser } as any)

      setSuccessMessage('Профиль успешно обновлен!')
      
      // Редирект на страницу настроек профиля через 2 секунды
      setTimeout(() => {
        navigate('/profile')
      }, 2000)
    } catch (err: any) {
      setError(translateError(err))
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitOrganization = async (data: OrganizationFormData) => {
    if (!user || !organizationType) return

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Пытаемся сохранить в БД (если таблица существует)
      try {
        const { error: updateError } = await supabase
          .from('organizations')
          .update({
            name: data.name,
            phone: data.phone,
            address: data.address,
          })
          .eq('user_id', user.id)

        if (updateError) {
          throw updateError
        }

        setSuccessMessage('Профиль успешно обновлен!')
        
        // Редирект на страницу настроек профиля через 2 секунды
        setTimeout(() => {
          navigate('/profile')
        }, 2000)
      } catch (dbError: any) {
        // Если таблицы нет, сохраняем в metadata (для фронтенда)
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            profile_data: {
              name: data.name,
              phone: data.phone,
              address: data.address,
            },
          },
        })

        if (updateError) {
          throw updateError
        }

        setSuccessMessage('Профиль успешно обновлен!')
        
        // Редирект на страницу настроек профиля через 2 секунды
        setTimeout(() => {
          navigate('/profile')
        }, 2000)
      }
    } catch (err: any) {
      setError(translateError(err))
    } finally {
      setIsLoading(false)
    }
  }

  // Загрузка
  if (isLoadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка профиля...</p>
        </div>
      </div>
    )
  }

  // Ошибка
  if (!organizationType) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-dark mb-3">
            Ошибка
          </h1>
          <p className="text-gray-600 text-sm font-manrope mb-6">
            {error || 'Не удалось загрузить профиль. Пожалуйста, заполните профиль сначала.'}
          </p>
          <Button onClick={() => navigate('/profile/setup')} fullWidth size="lg">
            Заполнить профиль
          </Button>
        </div>
      </div>
    )
  }

  // Форма для клиента
  if (organizationType === 'client') {
    return (
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white">
          <div className="flex items-center px-4 py-3 relative">
            <button
              onClick={() => navigate('/profile')}
              className="mr-4 p-2 -ml-2"
              aria-label="Назад"
            >
              <img 
                src="/icons/Иконка стрелка.png" 
                alt="Назад" 
                className="w-6 h-6 object-contain"
              />
            </button>
            <h1 className="absolute left-1/2 transform -translate-x-1/2 text-lg font-bold text-gray-dark">
              Настройки
            </h1>
          </div>
        </header>

        <div className="max-w-md mx-auto px-4 py-8">
          <h2 className="text-[32px] font-bold text-gray-dark mb-2 text-center">
            <span className="block">Редактирование</span>
            <span className="block">профиля</span>
          </h2>
          <p className="text-gray-600 mb-8 text-center text-sm font-manrope">
            Клиент
          </p>

          {successMessage && (
            <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm font-manrope text-green-600">{successMessage}</p>
            </div>
          )}

          <div className="bg-white rounded-3xl shadow-md p-6">
            <form onSubmit={clientForm.handleSubmit(onSubmitClient)} className="space-y-6">
              <Input
                label="Имя"
                placeholder="Введите имя"
                error={clientForm.formState.errors.firstName?.message}
                fullWidth
                {...clientForm.register('firstName')}
              />

              <Input
                label="Фамилия"
                placeholder="Введите фамилию"
                error={clientForm.formState.errors.lastName?.message}
                fullWidth
                {...clientForm.register('lastName')}
              />

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm font-manrope text-red-600">{error}</p>
                </div>
              )}

              <Button type="submit" fullWidth isLoading={isLoading} size="lg">
                Сохранить изменения
              </Button>
            </form>
          </div>

          {/* Кнопка выхода из аккаунта */}
          <div className="mt-6">
            <button
              onClick={async () => {
                if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
                  await logout()
                  navigate('/login')
                }
              }}
              className="w-full py-3.5 px-6 rounded-3xl text-white font-manrope font-bold text-base shadow-lg active:opacity-90 transition-opacity"
              style={{
                background: '#EF4444',
              }}
            >
              Выйти из аккаунта
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Форма для сотрудника
  if (organizationType === 'employee') {
    return (
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white">
          <div className="flex items-center px-4 py-3 relative">
            <button
              onClick={() => navigate('/profile')}
              className="mr-4 p-2 -ml-2"
              aria-label="Назад"
            >
              <img 
                src="/icons/Иконка стрелка.png" 
                alt="Назад" 
                className="w-6 h-6 object-contain"
              />
            </button>
            <h1 className="absolute left-1/2 transform -translate-x-1/2 text-lg font-bold text-gray-dark">
              Настройки
            </h1>
          </div>
        </header>

        <div className="max-w-md mx-auto px-4 py-8">
          <h2 className="text-[32px] font-bold text-gray-dark mb-2 text-center">
            <span className="block">Редактирование</span>
            <span className="block">профиля</span>
          </h2>
          <p className="text-gray-600 mb-8 text-center text-sm font-manrope">
            Сотрудник организации
          </p>

          {successMessage && (
            <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm font-manrope text-green-600">{successMessage}</p>
            </div>
          )}

          <div className="bg-white rounded-3xl shadow-md p-6">
            <form onSubmit={employeeForm.handleSubmit(onSubmitEmployee)} className="space-y-6">
              <Input
                label="Имя"
                placeholder="Введите имя"
                error={employeeForm.formState.errors.firstName?.message}
                fullWidth
                {...employeeForm.register('firstName')}
              />

              <Input
                label="Фамилия"
                placeholder="Введите фамилию"
                error={employeeForm.formState.errors.lastName?.message}
                fullWidth
                {...employeeForm.register('lastName')}
              />

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm font-manrope text-red-600">{error}</p>
                </div>
              )}

              <Button type="submit" fullWidth isLoading={isLoading} size="lg">
                Сохранить изменения
              </Button>
            </form>
          </div>

          {/* Кнопка выхода из аккаунта */}
          <div className="mt-6">
            <button
              onClick={async () => {
                if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
                  await logout()
                  navigate('/login')
                }
              }}
              className="w-full py-3.5 px-6 rounded-3xl text-white font-manrope font-bold text-base shadow-lg active:opacity-90 transition-opacity"
              style={{
                background: '#EF4444',
              }}
            >
              Выйти из аккаунта
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Форма для частной сиделки
  if (organizationType === 'caregiver') {
    return (
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white">
          <div className="flex items-center px-4 py-3 relative">
            <button
              onClick={() => navigate('/profile')}
              className="mr-4 p-2 -ml-2"
              aria-label="Назад"
            >
              <img 
                src="/icons/Иконка стрелка.png" 
                alt="Назад" 
                className="w-6 h-6 object-contain"
              />
            </button>
            <h1 className="absolute left-1/2 transform -translate-x-1/2 text-lg font-bold text-gray-dark">
              Настройки
            </h1>
          </div>
        </header>

        <div className="max-w-md mx-auto px-4 py-8">
          <h2 className="text-[32px] font-bold text-gray-dark mb-2 text-center">
            Редактирование профиля
          </h2>
          <p className="text-gray-600 mb-8 text-center text-sm font-manrope">
            Частная сиделка
          </p>

          {successMessage && (
            <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm font-manrope text-green-600">{successMessage}</p>
            </div>
          )}

          <div className="bg-white rounded-3xl shadow-md p-6">
            <form onSubmit={caregiverForm.handleSubmit(onSubmitCaregiver)} className="space-y-6">
              <Input
                label="Имя"
                placeholder="Введите имя"
                error={caregiverForm.formState.errors.firstName?.message}
                fullWidth
                {...caregiverForm.register('firstName')}
              />

              <Input
                label="Фамилия"
                placeholder="Введите фамилию"
                error={caregiverForm.formState.errors.lastName?.message}
                fullWidth
                {...caregiverForm.register('lastName')}
              />

              <Input
                label="Номер телефона"
                type="tel"
                placeholder="+7 (999) 123-45-67"
                error={caregiverForm.formState.errors.phone?.message}
                helperText="Номер телефона нужен для связи с поддержкой в WhatsApp"
                fullWidth
                {...caregiverForm.register('phone')}
              />

              <Input
                label="Город"
                placeholder="Введите город"
                error={caregiverForm.formState.errors.city?.message}
                fullWidth
                {...caregiverForm.register('city')}
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
                Сохранить изменения
              </Button>
            </form>
          </div>

          {/* Кнопка выхода из аккаунта */}
          <div className="mt-6">
            <button
              onClick={async () => {
                if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
                  await logout()
                  navigate('/login')
                }
              }}
              className="w-full py-3.5 px-6 rounded-3xl text-white font-manrope font-bold text-base shadow-lg active:opacity-90 transition-opacity"
              style={{
                background: '#EF4444',
              }}
            >
              Выйти из аккаунта
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Форма для организации (пансионат или патронажное агентство)
  const organizationTypeName = organizationType === 'pension' ? 'Пансионат' : 'Патронажное агентство'

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white">
        <div className="flex items-center px-4 py-3 relative">
          <button
            onClick={() => navigate('/profile')}
            className="mr-4 p-2 -ml-2"
            aria-label="Назад"
          >
            <img 
              src="/icons/Иконка стрелка.png" 
              alt="Назад" 
              className="w-6 h-6 object-contain"
            />
          </button>
          <h1 className="absolute left-1/2 transform -translate-x-1/2 text-lg font-bold text-gray-dark">
            Настройки
          </h1>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-8">
        <h2 className="text-[32px] font-bold text-gray-dark mb-2 text-center">
          Редактирование профиля
        </h2>
        <p className="text-gray-600 mb-8 text-center text-sm font-manrope">
          {organizationTypeName}
        </p>

        {successMessage && (
          <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm text-green-600">{successMessage}</p>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-md p-6">
          <form onSubmit={organizationForm.handleSubmit(onSubmitOrganization)} className="space-y-6">
            <Input
              label="Название организации"
              placeholder="Введите название организации"
              error={organizationForm.formState.errors.name?.message}
              fullWidth
              {...organizationForm.register('name')}
            />

            <Input
              label="Номер телефона"
              type="tel"
              placeholder="+7 (999) 123-45-67"
              error={organizationForm.formState.errors.phone?.message}
              helperText="Номер телефона нужен для связи с поддержкой в WhatsApp"
              fullWidth
              {...organizationForm.register('phone')}
            />

            <Input
              label="Адрес организации"
              placeholder="Введите адрес места нахождения организации"
              error={organizationForm.formState.errors.address?.message}
              fullWidth
              {...organizationForm.register('address')}
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
              Сохранить изменения
            </Button>
          </form>
        </div>

        {/* Кнопка выхода из аккаунта */}
        <div className="mt-6">
          <button
            onClick={async () => {
              if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
                await logout()
                navigate('/login')
              }
            }}
            className="w-full py-3.5 px-6 rounded-3xl text-white font-manrope font-bold text-base shadow-lg active:opacity-90 transition-opacity"
            style={{
              background: '#EF4444',
            }}
          >
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  )
}

