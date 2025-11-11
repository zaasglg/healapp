import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { translateError } from '@/lib/errorMessages'
import { Button, Input } from '@/components/ui'
import { ensureEmployeeInviteTokens } from '@/utils/inviteStorage'

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

// Схема валидации для сотрудника (только имя и фамилия, телефон уже известен из регистрации)
const employeeSchema = z.object({
  firstName: z.string().min(1, 'Введите имя'),
  lastName: z.string().min(1, 'Введите фамилию'),
})

// Схема валидации для клиента (только имя и фамилия, телефон уже известен из регистрации)
const clientSchema = z.object({
  firstName: z.string().min(1, 'Введите имя'),
  lastName: z.string().min(1, 'Введите фамилию'),
})

type CaregiverFormData = z.infer<typeof caregiverSchema>
type OrganizationFormData = z.infer<typeof organizationSchema>
type EmployeeFormData = z.infer<typeof employeeSchema>
type ClientFormData = z.infer<typeof clientSchema>

export const ProfileSetupPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [organizationType, setOrganizationType] = useState<OrganizationType | null>(null)
  const [isEmployee, setIsEmployee] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [clientData, setClientData] = useState<{
    caregiver_id?: string
    organization_id?: string
    patient_card_id?: string
    diary_id?: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const hasCheckedRef = useRef(false) // Флаг для предотвращения повторных проверок

  // Определение типа пользователя из metadata
  useEffect(() => {
    const checkUserType = async () => {
      // ВАЖНО: СНАЧАЛА проверяем localStorage для клиентов и сотрудников (приоритет!)
      // Это нужно, чтобы они определялись даже если user еще не обновлен в authStore
      let localStorageUser: any = null
      let localStorageUserRole: string | undefined
      
      console.log('ProfileSetupPage: Starting user type check...')
      
      try {
        const currentUserStr = localStorage.getItem('current_user')
        console.log('ProfileSetupPage: localStorage current_user:', currentUserStr)
        
        if (currentUserStr && currentUserStr !== '{}') {
          localStorageUser = JSON.parse(currentUserStr)
          localStorageUserRole = localStorageUser.user_role || localStorageUser.user_metadata?.user_role
          
          console.log('ProfileSetupPage: Parsed localStorage user:', {
            id: localStorageUser.id,
            role: localStorageUserRole,
            caregiver_id: localStorageUser.caregiver_id,
            organization_id: localStorageUser.organization_id,
            phone: localStorageUser.phone
          })
          
          // КЛИЕНТ: Если в localStorage есть клиент - используем его данные
          if (localStorageUserRole === 'client' && localStorageUser.id) {
            console.log('✅ ProfileSetupPage: Detected CLIENT from localStorage')
            setIsClient(true)
            setClientData({
              caregiver_id: localStorageUser.caregiver_id,
              organization_id: localStorageUser.organization_id,
              patient_card_id: localStorageUser.patient_card_id,
              diary_id: localStorageUser.diary_id,
            })
            setIsChecking(false)
            hasCheckedRef.current = true
            return
          }
          
          // СОТРУДНИК: Если в localStorage есть сотрудник - используем его данные
          if (localStorageUserRole === 'org_employee' && localStorageUser.id && localStorageUser.organization_id) {
            console.log('✅ ProfileSetupPage: Detected EMPLOYEE from localStorage')
            setIsEmployee(true)
            setOrganizationId(localStorageUser.organization_id)
            setIsChecking(false)
            hasCheckedRef.current = true
            return
          }
        }
      } catch (err) {
        console.error('ProfileSetupPage: Error parsing localStorage:', err)
      }

      // Если уже проверили - не проверяем снова
      if (hasCheckedRef.current) {
        console.log('ProfileSetupPage: Already checked, skipping...')
        return
      }

      // Если тип уже определен - не проверяем снова
      if (isEmployee || isClient || organizationType) {
        console.log('ProfileSetupPage: Type already determined:', { isEmployee, isClient, organizationType })
        setIsChecking(false)
        hasCheckedRef.current = true
        return
      }

      // Помечаем, что проверка началась
      hasCheckedRef.current = true

      // Если нет user в authStore, проверяем только localStorage (для клиентов и сотрудников)
      if (!user) {
        console.log('ProfileSetupPage: No user in authStore, but localStorage user was found - using it')
        // Если в localStorage уже нашли клиента/сотрудника - все ОК, выходим
        // Если не нашли - редиректим на login
        if (!localStorageUser?.id || (!localStorageUserRole || (localStorageUserRole !== 'client' && localStorageUserRole !== 'org_employee'))) {
          console.log('ProfileSetupPage: No valid user found, redirecting to login')
          navigate('/login')
        }
        return
      }

      console.log('ProfileSetupPage: Checking user from authStore:', {
        id: user.id,
        email: user.email,
        phone: (user as any).phone,
        user_role: (user as any).user_role,
        organization_type: user.user_metadata?.organization_type
      })

      // Проверяем user_role напрямую в user объекте
      const userRole = (user as any).user_role || user.user_metadata?.user_role as string | undefined
      
      console.log('ProfileSetupPage: Checking userRole:', userRole)
      
      // КЛИЕНТ: определяется ПЕРВЫМ, до проверки organization_type
      if (userRole === 'client') {
        console.log('✅ ProfileSetupPage: Detected CLIENT from authStore')
        setIsClient(true)
        setClientData({
          caregiver_id: (user as any).caregiver_id || user.user_metadata?.caregiver_id || localStorageUser?.caregiver_id,
          organization_id: (user as any).organization_id || user.user_metadata?.organization_id || localStorageUser?.organization_id,
          patient_card_id: (user as any).patient_card_id || user.user_metadata?.patient_card_id || localStorageUser?.patient_card_id,
          diary_id: (user as any).diary_id || user.user_metadata?.diary_id || localStorageUser?.diary_id,
        })
        setIsChecking(false)
        return
      }

      // ОРГАНИЗАЦИЯ/СИДЕЛКА: проверяем organization_type
      const userType = user.user_metadata?.organization_type as OrganizationType | undefined
      
      console.log('ProfileSetupPage: Checking organization_type:', userType)
      
      if (userType && ['pension', 'patronage_agency', 'caregiver'].includes(userType)) {
        console.log('✅ ProfileSetupPage: Detected ORGANIZATION/CAREGIVER:', userType)
        
        // Для организаций и сиделок проверяем подтверждение email
        // Частная сиделка должна подтвердить email кодом
        if (!user.email_confirmed_at) {
          console.log('Email not confirmed, redirecting to email confirmation')
          hasCheckedRef.current = false // Сбрасываем флаг перед редиректом
          navigate(`/email-confirmation?email=${encodeURIComponent(user.email || '')}`)
          return
        }

        // Устанавливаем тип организации/сиделки
        setOrganizationType(userType)
        setIsChecking(false)
        return
      }

      // СОТРУДНИК: определяется последним
      if (userRole === 'org_employee') {
        const orgId = (user as any).organization_id || 
                     user.user_metadata?.organization_id || 
                     localStorageUser?.organization_id
        
        console.log('ProfileSetupPage: Checking employee, orgId:', orgId)
        
        if (orgId && orgId !== 'temp') {
          console.log('✅ ProfileSetupPage: Detected EMPLOYEE')
          setIsEmployee(true)
          setOrganizationId(orgId)
          setIsChecking(false)
          return
        }
      }

      // Если не удалось определить тип - показываем ошибку
      console.error('❌ ProfileSetupPage: Could not determine user type:', {
        userRole,
        localStorageUserRole,
        userType,
        email: user.email,
        phone: (user as any).phone,
        hasLocalStorageData: !!localStorageUser?.id
      })
      setError('Не удалось определить тип пользователя. Проверьте данные регистрации.')
      setIsChecking(false)
      setTimeout(() => {
        hasCheckedRef.current = false // Сбрасываем флаг перед редиректом
        navigate('/register')
      }, 3000)
    }

    checkUserType()
  }, []) // Запускаем только один раз при монтировании

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

  const onSubmitCaregiver = async (data: CaregiverFormData) => {
    if (!user || !organizationType) return

    setIsLoading(true)
    setError(null)

    try {
      // Пытаемся сохранить в БД (если таблица существует)
      try {
        const { error: insertError } = await supabase
          .from('organizations')
          .insert({
            user_id: user.id,
            type: organizationType,
            first_name: data.firstName,
            last_name: data.lastName,
            name: `${data.firstName} ${data.lastName}`, // ФИО для отображения
            phone: data.phone,
            city: data.city,
            address: null, // Для сиделки адрес не обязателен
          })

        if (insertError) {
          throw insertError
        }
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
      }

      // Редирект на dashboard после успешного сохранения
      navigate('/dashboard')
    } catch (err: any) {
      setError(translateError(err))
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitClient = async (data: ClientFormData) => {
    if (!user || !clientData) return

    setIsLoading(true)
    setError(null)

    try {
      // Получаем телефон из user.phone (из регистрации) или из metadata
      const phone = (user as any).phone || user.user_metadata?.phone_for_login || user.user_metadata?.phone || null

      // Сохраняем в localStorage (для фронтенда)
      const clients = JSON.parse(localStorage.getItem('local_clients') || '[]')
      const existingIndex = clients.findIndex((c: any) => c.user_id === user.id)
      
      const clientProfileData = {
        user_id: user.id,
        caregiver_id: clientData.caregiver_id || null,
        organization_id: clientData.organization_id || null,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: phone,
        patient_card_id: clientData.patient_card_id || null,
        diary_id: clientData.diary_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (existingIndex !== -1) {
        clients[existingIndex] = { ...clients[existingIndex], ...clientProfileData }
      } else {
        clients.push(clientProfileData)
      }
      
      localStorage.setItem('local_clients', JSON.stringify(clients))

      // Обновляем текущего пользователя в localStorage
      const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
      currentUser.profile_data = {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: phone,
        caregiver_id: clientData.caregiver_id,
        organization_id: clientData.organization_id,
        patient_card_id: clientData.patient_card_id,
        diary_id: clientData.diary_id,
      }
      localStorage.setItem('current_user', JSON.stringify(currentUser))

      // Обновляем authStore
      const { setUser } = useAuthStore.getState()
      setUser({ ...user, ...currentUser } as any)

      // Редирект после заполнения профиля:
      // - Для сиделок: редирект на создание карточки подопечного (клиент создаст карточку и настроит дневник)
      // - Для организаций: редирект на dashboard (клиент уже привязан к существующей карточке и дневнику)
      // Редирект на личный кабинет клиента
      navigate('/profile')
    } catch (err: any) {
      setError('Не удалось сохранить профиль. Попробуйте ещё раз.')
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitEmployee = async (data: EmployeeFormData) => {
    if (!user) return

    setIsLoading(true)
    setError(null)

    try {
      // Получаем organization_id - важно! Сначала пробуем из user (из регистрации)
      let orgId = (user as any).organization_id || user.user_metadata?.organization_id || organizationId
      
      // Если organization_id = 'temp' или отсутствует, пытаемся получить из токена
      if (!orgId || orgId === 'temp') {
        const orgInviteToken = (user as any).organization_invite_token || user.user_metadata?.organization_invite_token
        if (orgInviteToken) {
          const tokens = ensureEmployeeInviteTokens()
          const tokenData = tokens.find(t => t.token === orgInviteToken)
          if (tokenData && tokenData.organization_id) {
            orgId = tokenData.organization_id
            console.log('Found organization_id from token:', orgId)
          }
        }
      }

      // Если все еще нет, используем 'temp' (это значит что токен был создан вручную)
      // Но это не должно происходить, так как organization_id должен быть в токене
      if (!orgId || orgId === 'temp') {
        console.warn('Warning: organization_id is still temp, employee may not be linked to organization')
        orgId = 'temp'
      }
      
      console.log('Saving employee with organization_id:', orgId, 'user_id:', user.id)
      
      // Получаем роль и тип организации из регистрации
      const employeeRole = (user as any).employee_role || user.user_metadata?.employee_role || null
      let organizationTypeValue =
        (user as any).organization_type ||
        user.user_metadata?.organization_type ||
        organizationType ||
        null
      if (!organizationTypeValue && orgInviteToken) {
        const tokens = ensureEmployeeInviteTokens()
        const tokenData = tokens.find(t => t.token === orgInviteToken)
        if (tokenData?.organization_type) {
          organizationTypeValue = tokenData.organization_type as OrganizationType
        }
      }
      
      // Получаем телефон из user.phone (из регистрации) или из metadata
      const phone = (user as any).phone || user.user_metadata?.phone_for_login || user.user_metadata?.phone || null

      // Сохраняем в localStorage (для фронтенда)
      const employees = JSON.parse(localStorage.getItem('local_employees') || '[]')
      const existingIndex = employees.findIndex((e: any) => e.user_id === user.id)
      
      // Получаем organization_invite_token из регистрации
      const orgInviteToken = (user as any).organization_invite_token || user.user_metadata?.organization_invite_token
      
      const employeeData = {
        user_id: user.id,
        organization_id: orgId, // Теперь правильный organization_id
        organization_type: organizationTypeValue,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: phone,
        role: employeeRole, // Сохраняем роль из токена
        organization_invite_token: orgInviteToken, // Сохраняем токен для связи с пригласительной ссылкой
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (existingIndex !== -1) {
        employees[existingIndex] = { ...employees[existingIndex], ...employeeData }
      } else {
        employees.push(employeeData)
      }
      
      localStorage.setItem('local_employees', JSON.stringify(employees))

      // Обновляем текущего пользователя в localStorage
      const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
      currentUser.organization_id = orgId
      currentUser.organization_type = organizationTypeValue
      currentUser.profile_data = {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: phone,
        organization_id: orgId,
        organization_type: organizationTypeValue,
      }
      localStorage.setItem('current_user', JSON.stringify(currentUser))

      // Обновляем authStore
      const { setUser } = useAuthStore.getState()
      setUser({ ...user, ...currentUser } as any)

      // Редирект на dashboard после успешного сохранения
      navigate('/dashboard')
    } catch (err: any) {
      setError('Не удалось сохранить профиль. Попробуйте ещё раз.')
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitOrganization = async (data: OrganizationFormData) => {
    if (!user || !organizationType) return

    setIsLoading(true)
    setError(null)

    try {
      // Пытаемся сохранить в БД (если таблица существует)
      try {
        const { error: insertError } = await supabase
          .from('organizations')
          .insert({
            user_id: user.id,
            type: organizationType,
            name: data.name,
            phone: data.phone,
            address: data.address,
            first_name: null, // Для организаций имя и фамилия не нужны
            last_name: null,
            city: null, // Для организаций город не обязателен
          })

        if (insertError) {
          throw insertError
        }
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
      }

      // Редирект на dashboard после успешного сохранения
      navigate('/dashboard')
    } catch (err: any) {
      setError(translateError(err))
    } finally {
      setIsLoading(false)
    }
  }

  // Загрузка или проверка
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  // Ошибка определения типа (если не удалось определить НИ ОДИН тип пользователя)
  if (!isEmployee && !isClient && !organizationType) {
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
            {error || 'Не удалось определить тип пользователя. Пожалуйста, зарегистрируйтесь заново.'}
          </p>
          <Button onClick={() => navigate('/register')} fullWidth size="lg">
            Вернуться к регистрации
          </Button>
        </div>
      </div>
    )
  }

  // Форма для клиента
  if (isClient) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="text-[32px] font-bold text-gray-dark mb-2 text-center">
          Заполнить профиль
        </h1>
        <p className="text-gray-600 mb-8 text-center text-sm font-manrope">
          Клиент
        </p>

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

          <Button
            type="submit"
            fullWidth
            isLoading={isLoading}
            size="lg"
          >
            Сохранить профиль
          </Button>
        </form>
      </div>
    )
  }

  // Форма для сотрудника
  if (isEmployee) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="text-[32px] font-bold text-gray-dark mb-2 text-center">
          Заполнить профиль
        </h1>
        <p className="text-gray-600 mb-8 text-center text-sm font-manrope">
          Сотрудник организации
        </p>

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

          <Button
            type="submit"
            fullWidth
            isLoading={isLoading}
            size="lg"
          >
            Сохранить профиль
          </Button>
        </form>
      </div>
    )
  }

  // Форма для частной сиделки
  if (organizationType === 'caregiver') {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-[32px] font-bold text-gray-dark mb-2 text-center">
        Заполнить профиль
      </h1>
        <p className="text-gray-600 mb-8 text-center text-sm font-manrope">
          Частная сиделка
        </p>

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
            Сохранить профиль
          </Button>
        </form>
      </div>
    )
  }

  // Форма для организации (пансионат или патронажное агентство)
  const organizationTypeName = organizationType === 'pension' ? 'Пансионат' : 'Патронажное агентство'

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-[32px] font-bold text-gray-dark mb-2 text-center">
        Заполнить профиль
      </h1>
      <p className="text-gray-600 mb-8 text-center text-sm font-manrope">
        {organizationTypeName}
      </p>

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
          Сохранить профиль
        </Button>
      </form>
    </div>
  )
}

