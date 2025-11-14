import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
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
  const queryClient = useQueryClient()
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
          
          // КЛИЕНТ: Если в localStorage есть клиент - проверяем, заполнен ли профиль
          if (localStorageUserRole === 'client' && localStorageUser.id) {
            console.log('✅ ProfileSetupPage: Detected CLIENT from localStorage')
            
            // Проверяем, заполнен ли профиль клиента в Supabase
            try {
              const { data: clientData, error: clientError } = await supabase
                .from('clients')
                .select('first_name, last_name')
                .eq('user_id', localStorageUser.id)
                .single()
              
              if (!clientError && clientData) {
                // Если имя и фамилия уже заполнены, редиректим на dashboard
                if (clientData.first_name && clientData.last_name) {
                  console.log('ProfileSetupPage: Client profile already filled, redirecting to dashboard')
                  navigate('/dashboard')
                  return
                }
              }
            } catch (err) {
              console.error('ProfileSetupPage: Error checking client profile:', err)
            }
            
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
        user_metadata_role: user.user_metadata?.role,
        user_metadata_user_role: user.user_metadata?.user_role,
        organization_type: user.user_metadata?.organization_type
      })

      // Проверяем user_role - может быть в разных местах
      // В Edge Function сохраняется как 'role', но также может быть 'user_role'
      let userRole = (user as any).user_role || 
                     user.user_metadata?.user_role || 
                     user.user_metadata?.role as string | undefined
      
      // Если роль не найдена в user_metadata, загружаем из user_profiles
      if (!userRole) {
        try {
          console.log('ProfileSetupPage: Role not found in metadata, loading from user_profiles...')
          const { data: userProfile, error: profileError } = await supabase
            .from('user_profiles')
            .select('role, organization_id')
            .eq('user_id', user.id)
            .single()
          
          if (!profileError && userProfile) {
            userRole = userProfile.role
            console.log('ProfileSetupPage: Loaded role from user_profiles:', userRole, 'organization_id:', userProfile.organization_id)
            
            // Если это сотрудник, загружаем organization_id
            if (userRole === 'org_employee' && userProfile.organization_id) {
              console.log('ProfileSetupPage: Setting organization_id from user_profiles:', userProfile.organization_id)
              setOrganizationId(userProfile.organization_id)
            }
          } else if (profileError) {
            console.error('ProfileSetupPage: Error loading user_profiles:', profileError)
          }
        } catch (err) {
          console.error('ProfileSetupPage: Error loading from user_profiles:', err)
        }
      }
      
      console.log('ProfileSetupPage: Final userRole:', userRole)
      
      // КЛИЕНТ: определяется ПЕРВЫМ, до проверки organization_type
      if (userRole === 'client') {
        console.log('✅ ProfileSetupPage: Detected CLIENT from authStore')
        
        // Проверяем, заполнен ли профиль клиента в Supabase
        try {
          const { data: clientData, error: clientError } = await supabase
            .from('clients')
            .select('first_name, last_name')
            .eq('user_id', user.id)
            .single()
          
          if (!clientError && clientData) {
            // Если имя и фамилия уже заполнены, редиректим на dashboard
            if (clientData.first_name && clientData.last_name) {
              console.log('ProfileSetupPage: Client profile already filled, redirecting to dashboard')
              navigate('/dashboard')
              return
            }
          }
        } catch (err) {
          console.error('ProfileSetupPage: Error checking client profile:', err)
        }
        
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
        let orgId = (user as any).organization_id || 
                     user.user_metadata?.organization_id || 
                     localStorageUser?.organization_id
        
        // Если organization_id не найден, загружаем из user_profiles или organization_employees
        if (!orgId || orgId === 'temp') {
          try {
            console.log('ProfileSetupPage: organization_id not found, loading from DB...')
            
            // Сначала пробуем user_profiles
            const { data: userProfile } = await supabase
              .from('user_profiles')
              .select('organization_id')
              .eq('user_id', user.id)
              .single()
            
            if (userProfile?.organization_id) {
              orgId = userProfile.organization_id
              console.log('ProfileSetupPage: Loaded organization_id from user_profiles:', orgId)
            } else {
              // Если нет в user_profiles, пробуем organization_employees
              const { data: employeeData } = await supabase
                .from('organization_employees')
                .select('organization_id')
                .eq('user_id', user.id)
                .single()
              
              if (employeeData?.organization_id) {
                orgId = employeeData.organization_id
                console.log('ProfileSetupPage: Loaded organization_id from organization_employees:', orgId)
              }
            }
          } catch (err) {
            console.error('ProfileSetupPage: Error loading organization_id:', err)
          }
        }
        
        console.log('ProfileSetupPage: Checking employee, orgId:', orgId)
        
        if (orgId && orgId !== 'temp') {
          console.log('✅ ProfileSetupPage: Detected EMPLOYEE with orgId:', orgId)
          setIsEmployee(true)
          setOrganizationId(orgId)
          setIsChecking(false)
          hasCheckedRef.current = true
          return
        } else {
          console.warn('ProfileSetupPage: Employee detected but no organization_id found')
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
      // Сохраняем в БД через RPC функцию (создает запись в user_profiles и organizations)
      try {
        // Сначала убеждаемся, что user_profiles создан
        // Для сиделки используется роль 'organization', так как она является организацией (частной)
        const { error: profileError } = await supabase.rpc('create_user_profile', {
          p_role: 'organization',
        })
        
        if (profileError && profileError.code !== '23505') { // Игнорируем ошибку дубликата
          console.warn('Не удалось создать/обновить user_profiles через RPC:', profileError)
        }
        
        // Создаем запись в organizations через RPC
        const { data: createdOrg, error: rpcError } = await supabase.rpc('create_organization', {
          p_organization_type: organizationType,
          p_name: `${data.firstName} ${data.lastName}`,
          p_phone: data.phone,
          p_address: null, // Для сиделки адрес не обязателен
        })

        if (rpcError) {
          throw rpcError
        }
        
        // Обновляем запись в organizations с дополнительными полями
        if (createdOrg?.id) {
          const { error: updateError } = await supabase
          .from('organizations')
            .update({
            first_name: data.firstName,
            last_name: data.lastName,
            city: data.city,
            })
            .eq('id', createdOrg.id)

          if (updateError) {
            console.warn('Не удалось обновить дополнительные поля организации:', updateError)
          }
        }

        // Обновляем метаданные пользователя
        await supabase.auth.updateUser({
          data: {
            organization_type: organizationType,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            city: data.city,
          },
          })
      } catch (dbError: any) {
        console.error('Ошибка создания организации:', dbError)
        // Если RPC не работает, сохраняем в metadata (fallback)
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            profile_data: {
              firstName: data.firstName,
              lastName: data.lastName,
              phone: data.phone,
              city: data.city,
            },
            organization_type: organizationType,
          },
        })

        if (updateError) {
          throw updateError
        }
      }

      // Обрабатываем pending токены доступа к дневникам через бэкенд
      if (user?.id) {
        try {
          console.log('[ProfileSetupPage] Обработка pending токенов доступа к дневникам после создания организации')
          
          // Небольшая задержка, чтобы убедиться, что организация создана и доступна
          await new Promise(resolve => setTimeout(resolve, 500))
          
          const { data: processResult, error: processError } = await supabase.rpc('process_pending_diary_access', {
            p_user_id: user.id
          })
          
          if (!processError && processResult) {
            console.log('[ProfileSetupPage] Результат обработки pending токенов:', processResult)
            
            if (processResult.success_count > 0) {
              console.log('[ProfileSetupPage] Успешно обработано токенов:', processResult.success_count)
              
              // Инвалидируем кэш запросов для dashboard
              await queryClient.invalidateQueries({ queryKey: ['dashboard-diaries'] })
              
              // Перенаправляем на dashboard, где дневники будут видны
              navigate('/dashboard', { replace: true })
              return
            } else if (processResult.error_count > 0) {
              console.log('[ProfileSetupPage] Некоторые токены не удалось обработать:', processResult.errors)
              // Продолжаем на dashboard, токены будут обработаны позже
            }
          } else if (processError) {
            console.error('[ProfileSetupPage] Ошибка обработки pending токенов:', processError)
          }
        } catch (tokenError) {
          console.error('[ProfileSetupPage] Ошибка обработки pending токенов:', tokenError)
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

      // Сохраняем в Supabase (таблица clients)
      // Проверяем, существует ли уже запись для этого клиента
      const { data: existingClient, error: checkError } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (checkError && checkError.code !== 'PGRST116') {
        // Ошибка, не связанная с отсутствием записи
        console.error('Ошибка проверки клиента:', checkError)
        throw checkError
      }

      if (existingClient) {
        // Обновляем существующую запись
        const { error: updateError } = await supabase
          .from('clients')
          .update({
        first_name: data.firstName,
        last_name: data.lastName,
        phone: phone,
            invited_by_caregiver_id: clientData.caregiver_id || null,
            invited_by_organization_id: clientData.organization_id || null,
          })
          .eq('user_id', user.id)

        if (updateError) {
          console.error('Ошибка обновления клиента:', updateError)
          throw updateError
        }
      } else {
        // Создаем новую запись
        const { error: insertError } = await supabase
          .from('clients')
          .insert({
            user_id: user.id,
            first_name: data.firstName,
            last_name: data.lastName,
            phone: phone,
            invited_by_caregiver_id: clientData.caregiver_id || null,
            invited_by_organization_id: clientData.organization_id || null,
          })

        if (insertError) {
          console.error('Ошибка создания клиента:', insertError)
          throw insertError
        }
      }

      // Обновляем user_metadata для удобства
      await supabase.auth.updateUser({
        data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: phone,
        },
      })

      console.log('✅ Профиль клиента сохранен в Supabase')

      // Редирект после заполнения профиля:
      // - Для сиделок: редирект на создание карточки подопечного (клиент создаст карточку и настроит дневник)
      // - Для организаций: редирект на dashboard (клиент уже привязан к существующей карточке и дневнику)
      // Редирект на личный кабинет клиента
      navigate('/profile')
    } catch (err: any) {
      console.error('Ошибка сохранения профиля клиента:', err)
      setError(translateError(err) || 'Не удалось сохранить профиль. Попробуйте ещё раз.')
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
      
      // Получаем токен приглашения (нужен для получения organization_type)
        const orgInviteToken = (user as any).organization_invite_token || user.user_metadata?.organization_invite_token
      
      // Если organization_id = 'temp' или отсутствует, пытаемся получить из токена
      if ((!orgId || orgId === 'temp') && orgInviteToken) {
          const tokens = ensureEmployeeInviteTokens()
          const tokenData = tokens.find(t => t.token === orgInviteToken)
          if (tokenData && tokenData.organization_id) {
            orgId = tokenData.organization_id
            console.log('Found organization_id from token:', orgId)
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
      let employeeRole = (user as any).employee_role || user.user_metadata?.employee_role || null
      
      // Если роль не найдена, загружаем из organization_employees
      if (!employeeRole) {
        try {
          const { data: employeeData } = await supabase
            .from('organization_employees')
            .select('role')
            .eq('user_id', user.id)
            .single()
          
          if (employeeData?.role) {
            employeeRole = employeeData.role
            console.log('ProfileSetupPage: Loaded role from organization_employees:', employeeRole)
          }
        } catch (err) {
          console.error('ProfileSetupPage: Error loading role from organization_employees:', err)
        }
      }
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

      // ВАЖНО: Сначала сохраняем в Supabase (приоритет!)
      try {
        console.log('ProfileSetupPage: Saving employee to Supabase:', {
          user_id: user.id,
          organization_id: orgId,
          first_name: data.firstName,
          last_name: data.lastName,
          phone: phone,
          role: employeeRole,
        })
        
        // Проверяем, существует ли запись в organization_employees
        const { data: existingEmployee, error: checkError } = await supabase
          .from('organization_employees')
          .select('id')
          .eq('user_id', user.id)
          .single()
        
        if (checkError && checkError.code !== 'PGRST116') {
          // PGRST116 = not found, это нормально для новой записи
          console.error('ProfileSetupPage: Error checking existing employee:', checkError)
        }
        
        if (existingEmployee) {
          // Обновляем существующую запись
          const { error: updateError } = await supabase
            .from('organization_employees')
            .update({
              first_name: data.firstName,
              last_name: data.lastName,
              phone: phone || null,
            })
            .eq('user_id', user.id)
          
          if (updateError) {
            console.error('ProfileSetupPage: Error updating employee in Supabase:', updateError)
            throw updateError
          }
          
          console.log('✅ ProfileSetupPage: Employee updated in Supabase')
        } else {
          // Создаем новую запись (если не существует)
          const { error: insertError } = await supabase
            .from('organization_employees')
            .insert({
              user_id: user.id,
              organization_id: orgId,
              first_name: data.firstName,
              last_name: data.lastName,
              phone: phone || null,
              role: employeeRole || 'caregiver', // Используем роль из токена или значение по умолчанию
            })
          
          if (insertError) {
            console.error('ProfileSetupPage: Error inserting employee in Supabase:', insertError)
            throw insertError
          }
          
          console.log('✅ ProfileSetupPage: Employee created in Supabase')
        }
      } catch (dbError: any) {
        console.error('ProfileSetupPage: Database error:', dbError)
        // Продолжаем, даже если БД не работает - сохраняем в localStorage как fallback
        setError('Не удалось сохранить в базу данных. Данные сохранены локально.')
      }

      // Также сохраняем в localStorage (для совместимости со старым кодом)
      const employees = JSON.parse(localStorage.getItem('local_employees') || '[]')
      const existingIndex = employees.findIndex((e: any) => e.user_id === user.id)
      
      const employeeData = {
        user_id: user.id,
        organization_id: orgId,
        organization_type: organizationTypeValue,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: phone,
        role: employeeRole,
        organization_invite_token: orgInviteToken,
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
      // Сохраняем в БД через RPC функцию (создает запись в user_profiles и organizations)
      try {
        const { error: rpcError } = await supabase.rpc('create_organization', {
          p_organization_type: organizationType,
          p_name: data.name,
          p_phone: data.phone,
          p_address: data.address,
        })

        if (rpcError) {
          throw rpcError
        }

        // Обновляем метаданные пользователя
        await supabase.auth.updateUser({
          data: {
            organization_type: organizationType,
            name: data.name,
            phone: data.phone,
            address: data.address,
          },
          })
      } catch (dbError: any) {
        console.error('Ошибка создания организации:', dbError)
        // Если RPC не работает, сохраняем в metadata (fallback)
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            profile_data: {
              name: data.name,
              phone: data.phone,
              address: data.address,
            },
            organization_type: organizationType,
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

