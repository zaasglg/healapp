import { useState, useEffect, useRef } from 'react'
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
          
          // Загружаем данные из БД (приоритет над metadata)
          try {
            const { data, error: dbError } = await supabase
              .from('organizations')
              .select('*')
              .eq('user_id', user.id)
              .single()

            if (!dbError && data) {
              setAvatarUrl(data.avatar_url || null)
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
              setIsLoadingProfile(false)
              return
            }
          } catch (err) {
            console.error('Ошибка загрузки организации из БД:', err)
          }
          
          // Fallback: используем metadata, если БД не вернула данные
          const profileData = user.user_metadata?.profile_data || user.user_metadata
          if (profileData) {
            if (userType === 'caregiver') {
              caregiverForm.reset({
                firstName: profileData.firstName || profileData.first_name || '',
                lastName: profileData.lastName || profileData.last_name || '',
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
          setIsLoadingProfile(false)
          return
        }

        // Только если organization_type отсутствует, проверяем user_role (для сотрудников и клиентов)
        // Для сотрудников и клиентов из localStorage user_role может быть напрямую в user
        // В Edge Function сохраняется как 'role', но также может быть 'user_role'
        let userRole = (user as any).user_role || 
                       user.user_metadata?.user_role || 
                       user.user_metadata?.role as string | undefined
        
        // Если роль не найдена в user_metadata, загружаем из user_profiles
        if (!userRole) {
          try {
            console.log('ProfileEditPage: Role not found in metadata, loading from user_profiles...')
            const { data: userProfile, error: profileError } = await supabase
              .from('user_profiles')
              .select('role')
              .eq('user_id', user.id)
              .single()
            
            if (!profileError && userProfile) {
              userRole = userProfile.role
              console.log('ProfileEditPage: Loaded role from user_profiles:', userRole)
            }
          } catch (err) {
            console.error('ProfileEditPage: Error loading from user_profiles:', err)
          }
        }
        
        console.log('ProfileEditPage: Final userRole:', userRole)
        
        // КЛИЕНТ: проверяем первым (приоритет перед сотрудниками)
        if (userRole === 'client') {
          setOrganizationType('client')
          
          // Загружаем данные клиента из Supabase
          try {
            const { data: clientData, error: clientError } = await supabase
              .from('clients')
              .select('first_name, last_name')
              .eq('user_id', user.id)
              .single()
            
            if (!clientError && clientData) {
              clientForm.reset({
                firstName: clientData.first_name || '',
                lastName: clientData.last_name || '',
              })
              setIsLoadingProfile(false)
              console.log('✅ ProfileEditPage: Client profile loaded from Supabase')
              return
            } else if (clientError && clientError.code === 'PGRST116') {
              // Запись не найдена - используем пустые значения
              console.log('ProfileEditPage: Client record not found, using empty values')
              clientForm.reset({
                firstName: '',
                lastName: '',
              })
              setIsLoadingProfile(false)
              return
            } else if (clientError) {
              console.error('Error loading client from Supabase:', clientError)
              setError('Не удалось загрузить профиль клиента')
            }
          } catch (err) {
            console.error('Error loading client from Supabase:', err)
            setError('Ошибка при загрузке профиля')
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
          console.log('ProfileEditPage: Detected org_employee, loading profile...')
          setOrganizationType('employee')
          
          // Загружаем данные сотрудника из Supabase
          try {
            const { data, error: dbError } = await supabase
              .from('organization_employees')
              .select('first_name, last_name')
              .eq('user_id', user.id)
              .single()

            console.log('ProfileEditPage: DB query result:', { data, error: dbError, hasData: !!data })

            if (!dbError && data) {
              employeeForm.reset({
                firstName: data.first_name || '',
                lastName: data.last_name || '',
              })
              setIsLoadingProfile(false)
              console.log('✅ ProfileEditPage: Employee profile loaded from Supabase')
              return
            } else if (dbError && dbError.code === 'PGRST116') {
              // Запись не найдена - используем пустые значения
              console.log('ProfileEditPage: Employee record not found, using empty values')
              employeeForm.reset({
                firstName: '',
                lastName: '',
              })
              setIsLoadingProfile(false)
              return
            } else if (dbError) {
              console.error('ProfileEditPage: DB error:', dbError)
              setError('Не удалось загрузить профиль сотрудника')
            }
          } catch (err) {
            console.error('ProfileEditPage: Error loading employee from Supabase:', err)
            setError('Ошибка при загрузке профиля')
          }
          
          // Если данных нет, устанавливаем пустые значения
          employeeForm.reset({
            firstName: '',
            lastName: '',
          })
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
      // Сохраняем в Supabase (таблица clients)
      const { error: updateError } = await supabase
        .from('clients')
        .update({
          first_name: data.firstName,
          last_name: data.lastName,
        })
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Error updating client in Supabase:', updateError)
        throw updateError
      }

      console.log('✅ ProfileEditPage: Client profile updated in Supabase')

      // Также обновляем user_metadata для удобства
      await supabase.auth.updateUser({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
        },
      })

      setSuccessMessage('Профиль успешно обновлен!')
      
      // Редирект на страницу настроек профиля через 2 секунды
      setTimeout(() => {
        navigate('/profile')
      }, 2000)
    } catch (err: any) {
      console.error('Error saving client profile:', err)
      setError(translateError(err) || 'Не удалось сохранить изменения. Попробуйте ещё раз.')
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
      // Получаем organization_id - сначала из user, затем из БД
      let orgId = (user as any).organization_id || user.user_metadata?.organization_id
      
      // Если organization_id не найден, загружаем из user_profiles или organization_employees
      if (!orgId || orgId === 'temp') {
        try {
          // Сначала пробуем user_profiles
          const { data: userProfile } = await supabase
            .from('user_profiles')
            .select('organization_id')
            .eq('user_id', user.id)
            .single()
          
          if (userProfile?.organization_id) {
            orgId = userProfile.organization_id
          } else {
            // Если нет в user_profiles, пробуем organization_employees
            const { data: employeeData } = await supabase
              .from('organization_employees')
              .select('organization_id')
              .eq('user_id', user.id)
              .single()
            
            if (employeeData?.organization_id) {
              orgId = employeeData.organization_id
            }
          }
        } catch (err) {
          console.error('ProfileEditPage: Error loading organization_id:', err)
        }
      }
      
      // Если все еще нет, используем 'temp' (fallback)
      if (!orgId || orgId === 'temp') {
        console.warn('ProfileEditPage: organization_id is still temp, using fallback')
        orgId = 'temp'
      }
      
      // Получаем телефон из user.phone (из регистрации) или из metadata
      const phone = (user as any).phone || user.user_metadata?.phone_for_login || user.user_metadata?.phone || null

      // Сохраняем в Supabase
      console.log('ProfileEditPage: Saving employee to Supabase:', {
        user_id: user.id,
        organization_id: orgId,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: phone,
      })
      
      // Проверяем, существует ли запись в organization_employees
      const { data: existingEmployee, error: checkError } = await supabase
        .from('organization_employees')
        .select('id')
        .eq('user_id', user.id)
        .single()
      
      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 = not found, это нормально для новой записи
        console.error('ProfileEditPage: Error checking existing employee:', checkError)
        throw checkError
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
          console.error('ProfileEditPage: Error updating employee in Supabase:', updateError)
          throw updateError
        }
        
        console.log('✅ ProfileEditPage: Employee updated in Supabase')
      } else {
        // Создаем новую запись (если не существует)
        const { error: insertError } = await supabase
          .from('organization_employees')
          .insert({
            user_id: user.id,
            organization_id: orgId !== 'temp' ? orgId : null,
            first_name: data.firstName,
            last_name: data.lastName,
            phone: phone || null,
            role: 'caregiver', // Значение по умолчанию, если роль не найдена
          })
        
        if (insertError) {
          console.error('ProfileEditPage: Error inserting employee in Supabase:', insertError)
          throw insertError
        }
        
        console.log('✅ ProfileEditPage: Employee created in Supabase')
      }
      
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

  // Обработка загрузки аватара
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    // Проверка типа файла
    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение')
      return
    }

    // Проверка размера (макс 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Размер файла не должен превышать 5MB')
      return
    }

    setIsUploadingAvatar(true)
    setError(null)

    try {
      // Генерируем уникальное имя файла
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = fileName // Убираем префикс avatars/, так как bucket уже называется avatars

      console.log('ProfileEditPage: Uploading avatar to bucket "avatars", filePath:', filePath)

      // Загружаем файл в Supabase Storage напрямую
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) {
        console.error('ProfileEditPage: Upload error:', uploadError)
        console.error('ProfileEditPage: Upload error details:', {
          message: uploadError.message,
          statusCode: (uploadError as any).statusCode,
          error: (uploadError as any).error,
        })
        
        // Проверяем тип ошибки и показываем понятное сообщение
        let errorMessage = 'Не удалось загрузить аватар. '
        
        if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
          errorMessage += 'Bucket "avatars" не найден. Убедитесь, что bucket создан в Supabase Storage.'
        } else if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('RLS')) {
          errorMessage += 'Нет прав на загрузку файла. Обратитесь к администратору для настройки политик Storage.'
        } else if (uploadError.message?.includes('JWT')) {
          errorMessage += 'Ошибка аутентификации. Попробуйте выйти и войти снова.'
        } else if (uploadError.message?.includes('size') || uploadError.message?.includes('limit')) {
          errorMessage += 'Файл слишком большой. Максимальный размер: 5MB.'
        } else {
          errorMessage += uploadError.message || 'Попробуйте еще раз.'
        }
        
        throw new Error(errorMessage)
      }

      console.log('ProfileEditPage: File uploaded successfully:', uploadData)

      // Получаем публичный URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)
      
      console.log('ProfileEditPage: Public URL generated:', publicUrl)

      // Обновляем avatar_url в БД сразу
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id)

      if (updateError) {
        throw updateError
      }

      // Обновляем локальное состояние
      setAvatarUrl(publicUrl)
      setSuccessMessage('Аватар успешно загружен!')
    } catch (error: any) {
      console.error('Ошибка загрузки аватара:', error)
      setError('Не удалось загрузить аватар. Попробуйте еще раз.')
    } finally {
      setIsUploadingAvatar(false)
      // Сбрасываем input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const onSubmitOrganization = async (data: OrganizationFormData) => {
    if (!user || !organizationType) {
      console.error('ProfileEditPage: Missing user or organizationType', { user: !!user, organizationType })
      setError('Ошибка: не удалось определить пользователя или тип организации')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    console.log('ProfileEditPage: Starting save organization profile', {
      userId: user.id,
      organizationType,
      data: {
        name: data.name,
        phone: data.phone,
        address: data.address,
        hasAvatar: !!avatarUrl,
      }
    })

    try {
      // Сохраняем в БД (включая avatar_url если он был загружен)
      const updateData: any = {
        name: data.name.trim(),
        phone: data.phone.trim(),
        address: data.address.trim(),
      }
      
      if (avatarUrl) {
        updateData.avatar_url = avatarUrl
      }

      console.log('ProfileEditPage: Updating organization with data:', updateData)

      // Сначала проверяем, существует ли запись
      const { data: existingOrg, error: checkError } = await supabase
        .from('organizations')
        .select('id, name, phone, address')
        .eq('user_id', user.id)
        .single()

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('ProfileEditPage: Error checking existing organization:', checkError)
        throw new Error(`Ошибка проверки записи: ${checkError.message}`)
      }

      if (!existingOrg) {
        console.error('ProfileEditPage: Organization not found for user_id:', user.id)
        throw new Error('Организация не найдена. Обратитесь в поддержку.')
      }

      console.log('ProfileEditPage: Existing organization found:', existingOrg)

      // Обновляем запись
      const { data: updatedData, error: updateError } = await supabase
        .from('organizations')
        .update(updateData)
        .eq('user_id', user.id)
        .select()

      if (updateError) {
        console.error('ProfileEditPage: Error updating organization:', updateError)
        console.error('ProfileEditPage: Update error details:', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        })
        throw updateError
      }

      if (!updatedData || updatedData.length === 0) {
        console.error('ProfileEditPage: No data returned after update')
        throw new Error('Не удалось обновить профиль. Попробуйте еще раз.')
      }

      console.log('✅ ProfileEditPage: Organization profile updated successfully:', updatedData[0])
      setSuccessMessage('Профиль успешно обновлен!')
      
      // Редирект на страницу профиля через 2 секунды после успешного сохранения
      setTimeout(() => {
        navigate('/profile')
      }, 2000)
    } catch (err: any) {
      console.error('ProfileEditPage: Error saving organization profile:', err)
      const errorMessage = err?.message || translateError(err) || 'Не удалось сохранить изменения. Попробуйте ещё раз.'
      setError(errorMessage)
      setIsLoading(false) // Убираем loading, чтобы пользователь мог попробовать снова
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
            {/* Загрузка аватара */}
            <div className="flex flex-col items-center mb-6">
              <div 
                onClick={handleAvatarClick}
                className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden cursor-pointer relative group bg-gray-100 mb-2"
              >
                {avatarUrl ? (
                  <img 
                    src={avatarUrl} 
                    alt="Аватар" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img 
                    src="/icons/Иконка профиль.png" 
                    alt="Профиль" 
                    className="w-full h-full object-contain"
                  />
                )}
                {isUploadingAvatar && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full"></div>
                  </div>
                )}
                {!isUploadingAvatar && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                    <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleAvatarClick}
                className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? 'Загрузка...' : 'Выбрать аватар'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

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

