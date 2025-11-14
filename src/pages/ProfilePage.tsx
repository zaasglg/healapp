import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui'

// Тип организации
type OrganizationType = 'pension' | 'patronage_agency' | 'caregiver'

interface ProfileData {
  name: string
  type: OrganizationType | 'employee'
  phone?: string
  city?: string
  address?: string
  firstName?: string
  lastName?: string
}

export const ProfilePage = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [organizationType, setOrganizationType] = useState<OrganizationType | 'employee' | 'client' | null>(null)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
              setProfileData({
                name: data.name || '',
                type: userType,
                phone: data.phone || null,
                city: data.city || null,
                address: data.address || null,
                firstName: data.first_name || null,
                lastName: data.last_name || null,
              })
              setIsLoading(false)
              return
            }
          } catch (err) {
            console.error('Ошибка загрузки организации из БД:', err)
          }
          
          // Fallback: проверяем metadata, если БД не вернула данные
          const profileData = user.user_metadata?.profile_data || user.user_metadata
          if (profileData) {
            setProfileData({
              name: userType === 'caregiver' 
                ? `${profileData.firstName || profileData.first_name || ''} ${profileData.lastName || profileData.last_name || ''}`.trim()
                : profileData.name || '',
              type: userType,
              phone: profileData.phone || null,
              city: profileData.city || null,
              address: profileData.address || null,
              firstName: profileData.firstName || profileData.first_name || null,
              lastName: profileData.lastName || profileData.last_name || null,
            })
          }
          setIsLoading(false)
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
            console.log('ProfilePage: Role not found in metadata, loading from user_profiles...')
            const { data: userProfile, error: profileError } = await supabase
              .from('user_profiles')
              .select('role')
              .eq('user_id', user.id)
              .maybeSingle()
            
            if (!profileError && userProfile?.role) {
              userRole = userProfile.role
              console.log('ProfilePage: Loaded role from user_profiles:', userRole)
            } else if (profileError && profileError.code !== 'PGRST116') {
              // PGRST116 = not found, это нормально для новых пользователей
              console.error('ProfilePage: Error loading from user_profiles:', profileError)
            }
          } catch (err) {
            console.error('ProfilePage: Error loading from user_profiles:', err)
          }
        }
        
        console.log('ProfilePage: Final userRole:', userRole)
        
        // КЛИЕНТ: проверяем первым (приоритет перед сотрудниками)
        if (userRole === 'client') {
          setOrganizationType('client' as any)
          
          // Загружаем данные клиента из Supabase (приоритет над localStorage)
          try {
            const { data: clientData, error: clientError } = await supabase
              .from('clients')
              .select('first_name, last_name, phone')
              .eq('user_id', user.id)
              .single()
            
            if (!clientError && clientData) {
              const phone = clientData.phone || (user as any).phone || user.user_metadata?.phone || null
              setProfileData({
                name: `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim(),
                type: 'client' as any,
                firstName: clientData.first_name,
                lastName: clientData.last_name,
                phone: phone,
              })
              setIsLoading(false)
              console.log('✅ ProfilePage: Client profile loaded from Supabase')
              return
            }
          } catch (err) {
            console.error('Error loading client from Supabase:', err)
          }
          
          // Fallback: Загружаем данные клиента из localStorage
          try {
            const clients = JSON.parse(localStorage.getItem('local_clients') || '[]')
            const clientData = clients.find((c: any) => c.user_id === user.id)
            
            if (clientData) {
              const phone = (user as any).phone || user.user_metadata?.phone || clientData.phone || null
              setProfileData({
                name: `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim(),
                type: 'client' as any,
                firstName: clientData.first_name,
                lastName: clientData.last_name,
                phone: phone,
              })
              setIsLoading(false)
              console.log('✅ ProfilePage: Client profile loaded from localStorage')
              return
            }
          } catch (err) {
            console.log('Error loading client from localStorage:', err)
          }

          // Если нет в local_clients, проверяем profile_data из current_user
          try {
            const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
            if (currentUser.profile_data) {
              const phone = (user as any).phone || user.user_metadata?.phone || currentUser.profile_data.phone || currentUser.phone || null
              setProfileData({
                name: `${currentUser.profile_data.firstName || ''} ${currentUser.profile_data.lastName || ''}`.trim(),
                type: 'client' as any,
                firstName: currentUser.profile_data.firstName,
                lastName: currentUser.profile_data.lastName,
                phone: phone,
              })
              setIsLoading(false)
              console.log('✅ ProfilePage: Client profile loaded from current_user')
              return
            }
          } catch (err) {
            console.log('Error loading client from current_user:', err)
          }
          
          // Если ничего не найдено, показываем ошибку
          setIsLoading(false)
          return
        }
        
        // СОТРУДНИК: проверяем вторым
        if (userRole === 'org_employee') {
          console.log('ProfilePage: Detected org_employee, loading profile...')
          
          // Сначала проверяем localStorage (для фронтенд-решения)
          try {
            const employees = JSON.parse(localStorage.getItem('local_employees') || '[]')
            const employeeData = employees.find((e: any) => e.user_id === user.id)
            
            if (employeeData) {
              // Если first_name и last_name пустые, перенаправляем на заполнение профиля
              if (!employeeData.first_name && !employeeData.last_name) {
                console.log('ProfilePage: Employee in localStorage has no first_name/last_name, redirecting to setup')
                navigate('/profile/setup')
                return
              }
              
              const phone = (user as any).phone || user.user_metadata?.phone_for_login || user.user_metadata?.phone || employeeData.phone || null
              setProfileData({
                name: `${employeeData.first_name || ''} ${employeeData.last_name || ''}`.trim(),
                type: 'employee',
                firstName: employeeData.first_name,
                lastName: employeeData.last_name,
                phone: phone,
              })
              setOrganizationType('employee')
              setIsLoading(false)
              console.log('✅ ProfilePage: Employee profile loaded from localStorage')
              return
            }
          } catch (err) {
            console.log('Error loading from localStorage:', err)
          }

          // Если нет в localStorage, проверяем profile_data из current_user
          try {
            const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
            if (currentUser.profile_data) {
              // Если first_name и last_name пустые, перенаправляем на заполнение профиля
              if (!currentUser.profile_data.firstName && !currentUser.profile_data.lastName) {
                console.log('ProfilePage: current_user profile_data has no firstName/lastName, redirecting to setup')
                navigate('/profile/setup')
                return
              }
              
              const phone = (user as any).phone || user.user_metadata?.phone_for_login || user.user_metadata?.phone || currentUser.profile_data.phone || null
              setProfileData({
                name: `${currentUser.profile_data.firstName || ''} ${currentUser.profile_data.lastName || ''}`.trim(),
                type: 'employee',
                firstName: currentUser.profile_data.firstName,
                lastName: currentUser.profile_data.lastName,
                phone: phone,
              })
              setOrganizationType('employee')
              setIsLoading(false)
              console.log('✅ ProfilePage: Employee profile loaded from current_user')
              return
            }
          } catch (err) {
            console.log('Error loading from current_user:', err)
          }

          // Если нет в localStorage, пытаемся загрузить из БД (с таймаутом)
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

            console.log('ProfilePage: DB query result:', { data, error: dbError, hasData: !!data })

            if (!dbError && data) {
              const phone = (user as any).phone || user.user_metadata?.phone_for_login || user.user_metadata?.phone || data.phone || null
              
              console.log('ProfilePage: Employee data from DB:', {
                first_name: data.first_name,
                last_name: data.last_name,
                phone: phone,
                hasFirstName: !!data.first_name,
                hasLastName: !!data.last_name,
              })
              
              // Если first_name и last_name пустые, перенаправляем на заполнение профиля
              if (!data.first_name && !data.last_name) {
                console.log('ProfilePage: Employee has no first_name/last_name, redirecting to setup')
                navigate('/profile/setup')
                return
              }
              
              setProfileData({
                name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
                type: 'employee',
                firstName: data.first_name,
                lastName: data.last_name,
                phone: phone,
              })
              setOrganizationType('employee')
              setIsLoading(false)
              console.log('✅ ProfilePage: Employee profile loaded successfully from DB')
              return
            } else if (dbError) {
              console.error('ProfilePage: DB error:', dbError)
              if (dbError.code === 'PGRST116') {
                // Запись не найдена - перенаправляем на заполнение
                console.log('ProfilePage: Employee record not found (PGRST116), redirecting to setup')
                navigate('/profile/setup')
                return
              }
              // Для других ошибок продолжаем проверку metadata
              console.log('ProfilePage: DB error (not PGRST116), trying metadata fallback')
            }
          } catch (err) {
            // Таймаут или ошибка - используем metadata
            console.log('DB query timeout or error, using metadata')
            const phone = (user as any).phone || user.user_metadata?.phone_for_login || user.user_metadata?.phone || null
            const profileData = user.user_metadata?.profile_data || (user as any).profile_data
            if (profileData) {
              setProfileData({
                name: `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim(),
                type: 'employee',
                firstName: profileData.firstName,
                lastName: profileData.lastName,
                phone: phone,
              })
              setOrganizationType('employee')
              console.log('✅ ProfilePage: Employee profile loaded from metadata fallback')
            } else {
              // Если нет данных ни в БД, ни в metadata - перенаправляем на заполнение
              console.log('ProfilePage: No employee data found, redirecting to setup')
              navigate('/profile/setup')
              return
            }
          }
          setIsLoading(false)
          return
        }
      } catch (err) {
        console.error('Error loading profile:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [user, navigate])

  // Загрузка
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка профиля...</p>
        </div>
      </div>
    )
  }

  // Ошибка
  if (!organizationType || !profileData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-100">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-dark mb-3">
            Ошибка
          </h1>
          <p className="text-gray-600 text-sm mb-6">
            Не удалось загрузить профиль. Пожалуйста, заполните профиль сначала.
          </p>
          <Button onClick={() => navigate('/profile/setup')} fullWidth size="lg">
            Заполнить профиль
          </Button>
        </div>
      </div>
    )
  }

  const isOrganization = organizationType === 'pension' || organizationType === 'patronage_agency'
  const isEmployee = organizationType === 'employee'
  const isClient = organizationType === 'client'
  const isCaregiver = organizationType === 'caregiver'

  // const handleLogout = async () => {
  //   try {
  //     await logout()
  //     navigate('/login', { replace: true })
  //   } catch (error) {
  //     console.error('Ошибка при выходе из аккаунта', error)
  //     navigate('/login', { replace: true })
  //   }
  // }
  
  // Получаем имя (первое слово для отображения в карточке)
  const displayName = (isEmployee || isClient) && profileData.firstName 
    ? profileData.firstName 
    : profileData.name.split(' ')[0] || profileData.name

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white">
        <div className="flex items-center px-4 py-3 relative">
          <button
            onClick={() => navigate('/dashboard')}
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
            Профиль
          </h1>
        </div>
      </header>

      <div className="flex-1 max-w-md mx-auto w-full px-4 pb-0">
        {/* Карточка профиля пользователя */}
        <div className="bg-white rounded-3xl shadow-md p-4 mb-6 mt-4">
          <div className="flex items-center gap-3">
            {/* Аватар */}
            <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img 
                src="/icons/Иконка профиль.png" 
                alt="Профиль" 
                className="w-full h-full object-contain"
              />
            </div>

            {/* Информация о пользователе */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-dark mb-1.5">
                {displayName}
              </h2>
              {profileData.phone && (
                <p className="text-xs font-manrope text-gray-600 mb-1.5">
                  {profileData.phone}
                </p>
              )}
              {/* Адрес для организаций */}
              {isOrganization && profileData.address && (
                <p className="text-xs font-manrope text-gray-600 mb-2">
                  {profileData.address}
                </p>
              )}
              {/* Город для сиделок (не для сотрудников) */}
              {!isOrganization && !isEmployee && profileData.city && (
                <p className="text-xs font-manrope text-gray-600 mb-2">
                  г. {profileData.city}
                </p>
              )}
              <button
                onClick={() => navigate('/profile/edit')}
                className="px-3 py-1.5 text-white rounded-lg text-xs font-manrope font-normal hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #7DD3DC 0%, #5CBCC7 100%)' }}
              >
                Настройки
              </button>
            </div>
          </div>
        </div>

        {/* Секция "Управление профилем" */}
        <div className="mb-0">
          <h3 className="text-2xl font-bold text-gray-dark mb-6 mt-2">
            Управление профилем
          </h3>

          <div className="space-y-4">
            {/* Карточка: Мои дневники */}
            <div 
              onClick={() => navigate('/dashboard')}
              className="bg-white rounded-2xl shadow-md p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <p className="text-lg font-bold text-gray-dark mb-1">
                  Мои дневники
                </p>
                <p className="text-xs font-manrope text-gray-500">
                  Просмотр и управление
                </p>
              </div>
              <img 
                src="/icons/иконка маленькая стрелка.png" 
                alt="" 
                className="w-5 h-5 ml-4 flex-shrink-0 object-contain"
              />
            </div>

            {/* Карточка: Карточки подопечных (для всех: организаций, сиделок, сотрудников и клиентов) */}
            <div 
              onClick={() => navigate('/profile/patient-cards')}
              className="bg-white rounded-2xl shadow-md p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <p className="text-lg font-bold text-gray-dark mb-1">
                  Карточки подопечных
                </p>
                <p className="text-xs font-manrope text-gray-500">
                  {isEmployee ? 'Просмотр' : 'Просмотр и редактирование'}
                </p>
              </div>
              <img 
                src="/icons/иконка маленькая стрелка.png" 
                alt="" 
                className="w-5 h-5 ml-4 flex-shrink-0 object-contain"
              />
            </div>

            {/* Карточка: Сотрудники (только для организаций, не для сотрудников, не для клиентов) */}
            {isOrganization && !isEmployee && !isClient && (
              <div 
                onClick={() => navigate('/profile/employees')}
                className="bg-white rounded-2xl shadow-md p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="text-lg font-bold text-gray-dark mb-1">
                    Сотрудники
                  </p>
                  <p className="text-xs font-manrope text-gray-500">
                    Управление командой
                  </p>
                </div>
                <img 
                  src="/icons/иконка маленькая стрелка.png" 
                  alt="" 
                  className="w-5 h-5 ml-4 flex-shrink-0 object-contain"
                />
              </div>
            )}

            {/* Карточка: Клиенты (только для организаций, не для сотрудников, не для клиентов) */}
            {isOrganization && !isEmployee && !isClient && (
              <div 
                onClick={() => navigate('/profile/clients')}
                className="bg-white rounded-2xl shadow-md p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="text-lg font-bold text-gray-dark mb-1">
                    Клиенты
                  </p>
                  <p className="text-xs font-manrope text-gray-500">
                    Список клиентов организации
                  </p>
                </div>
                <img 
                  src="/icons/иконка маленькая стрелка.png" 
                  alt="" 
                  className="w-5 h-5 ml-4 flex-shrink-0 object-contain"
                />
              </div>
            )}

            {/* Карточка: Пригласить клиента (только для частных сиделок, не для клиентов) */}
            {isCaregiver && !isClient && !isEmployee && (
              <div 
                onClick={() => navigate('/profile/invite-client')}
                className="bg-white rounded-2xl shadow-md p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="text-lg font-bold text-gray-dark mb-1">
                    Пригласить клиента
                  </p>
                  <p className="text-xs font-manrope text-gray-500">
                    Создать пригласительную ссылку
                  </p>
                </div>
                <img 
                  src="/icons/иконка маленькая стрелка.png" 
                  alt="" 
                  className="w-5 h-5 ml-4 flex-shrink-0 object-contain"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Белый блок с кнопкой "Связаться с поддержкой" */}
      <div className="mt-8 flex-1 flex flex-col justify-end">
        <div className="bg-white rounded-t-[30px] pb-8 pt-6 max-w-md mx-auto w-full">
          <div className="px-4">
            <button
              onClick={() => {
                // Открываем WhatsApp чат с поддержкой
                const phoneNumber = '79244415365' // Номер без знака +
                const whatsappUrl = `https://wa.me/${phoneNumber}`
                window.open(whatsappUrl, '_blank')
              }}
              className="w-full py-3.5 px-6 rounded-3xl text-white font-manrope font-bold text-base shadow-lg active:opacity-90 transition-opacity"
              style={{
                background: '#55ACBF',
              }}
            >
              Связаться с поддержкой
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
