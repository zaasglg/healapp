import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button, Input } from '@/components/ui'

interface DashboardPatientCard {
  id: string
  full_name: string
  date_of_birth: string | null
  address?: string | null
  metadata?: {
    address?: string | null
    [key: string]: unknown
  } | null
}

interface DashboardDiary {
  id: string
  created_at: string
  status: string
  patient_card: DashboardPatientCard | null
}

type SupabaseDiaryRow = {
  id: string
  created_at: string
  status?: string | null
  patient_card?: DashboardPatientCard | DashboardPatientCard[] | null
  patient_cards?: DashboardPatientCard[] | null
  patient_card_id?: string | null
}

const mapDiaryRow = (row: SupabaseDiaryRow): DashboardDiary => {
  const card =
    (Array.isArray(row.patient_card) ? row.patient_card[0] : row.patient_card) ||
    row.patient_cards?.[0] ||
    null

  return {
    id: row.id,
    created_at: row.created_at,
    status: row.status ?? 'active',
    patient_card: card
      ? {
          id: card.id,
          full_name: card.full_name ?? '',
          date_of_birth: card.date_of_birth ?? null,
          address: card.address ?? card.metadata?.address ?? null,
        }
      : null,
  }
}

const computeAge = (date: string | null): number | null => {
  if (!date) return null
  const birth = new Date(date)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }
  return age
}

export const DashboardPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [userRole, setUserRole] = useState<string | undefined>(user?.user_metadata?.user_role)

  // Загружаем роль из user_profiles, если не найдена в user_metadata
  useEffect(() => {
    const loadUserRole = async () => {
      if (!user?.id) return
      
      // Проверяем разные места, где может быть роль
      const roleFromMetadata = user.user_metadata?.user_role || user.user_metadata?.role
      
      // Если роль уже есть в user_metadata, используем её
      if (roleFromMetadata) {
        setUserRole(roleFromMetadata)
        return
      }

      // Иначе загружаем из user_profiles
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!profileError && profileData?.role) {
          setUserRole(profileData.role)
        } else if (profileError && profileError.code !== 'PGRST116') {
          // PGRST116 = not found, это нормально для новых пользователей
          console.error('Ошибка загрузки роли пользователя:', profileError)
        }
      } catch (error) {
        console.error('Ошибка загрузки роли пользователя:', error)
      }
    }

    loadUserRole()
  }, [user])

  const organizationType = user?.user_metadata?.organization_type

  const isEmployee = userRole === 'org_employee'
  // ВАЖНО: Сиделки имеют роль 'organization' с organization_type = 'caregiver'
  const isCaregiver = organizationType === 'caregiver' || (userRole === 'organization' && organizationType === 'caregiver')

  const {
    data: diaries = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<DashboardDiary[]>({
    queryKey: ['dashboard-diaries', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return []

      // Добавляем логирование для отладки
      console.log('[DashboardPage] Загрузка дневников для пользователя:', {
        user_id: user.id,
        userRole,
        organizationType,
        isCaregiver,
      })

      // Для сиделок проверяем, что current_organization_id работает правильно
      if (isCaregiver) {
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('id, user_id, organization_type')
          .eq('user_id', user.id)
          .eq('organization_type', 'caregiver')
          .maybeSingle()
        
        console.log('[DashboardPage] Данные организации-сиделки:', orgData, 'Ошибка:', orgError)
        
        if (orgData) {
          console.log('[DashboardPage] ID организации-сиделки:', orgData.id)
        }
      }

      const { data, error: queryError } = await supabase
          .from('diaries')
        .select(
          `
            id,
            created_at,
          status,
            caregiver_id,
          organization_id,
          patient_card:patient_card_id (
            id,
            full_name,
            date_of_birth,
            metadata
          )
        `
        )
          .order('created_at', { ascending: false })

      if (queryError) {
        console.error('[DashboardPage] Ошибка загрузки дневников:', queryError)
        console.error('[DashboardPage] Детали ошибки:', {
          message: queryError.message,
          details: queryError.details,
          hint: queryError.hint,
          code: queryError.code,
        })
        throw queryError
      }

      console.log('[DashboardPage] Загружено дневников:', data?.length || 0)
      if (data && data.length > 0) {
        console.log('[DashboardPage] Детали загруженных дневников:', data.map((d: any) => ({
          id: d.id,
          caregiver_id: d.caregiver_id,
          organization_id: d.organization_id,
          patient_card: d.patient_card,
        })))
          } else {
        console.log('[DashboardPage] Дневники не загружены. Возможные причины:')
        console.log('[DashboardPage] - RLS политики блокируют доступ')
        console.log('[DashboardPage] - has_diary_access возвращает false')
        console.log('[DashboardPage] - current_organization_id не совпадает с caregiver_id')
      }

      if (!data) return []
      return data.map(mapDiaryRow)
    },
    retry: 1,
    staleTime: 1000 * 30,
  })

  const filteredDiaries = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase()
    if (!normalized) return diaries
    return diaries.filter(diary => {
      const name = diary.patient_card?.full_name?.toLowerCase() ?? ''
      return name.includes(normalized)
    })
  }, [diaries, searchQuery])

  const handleCreateDiary = () => {
    if (isCaregiver || isEmployee) return
    navigate('/diaries/new')
  }

  const handleDiaryClick = (diaryId: string) => {
    navigate(`/diaries/${diaryId}`)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-md mx-auto px-4 pt-4 pb-24">
        {/* Иконка профиля и заголовок в одной строке */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-dark">
            Мои дневники
          </h1>
          <button
            onClick={() => navigate('/profile')}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity flex-shrink-0"
          >
            <img
              src="/icons/Иконка профиль.png"
              alt="Профиль"
              className="w-10 h-10"
            />
          </button>
        </div>

        {/* Поиск */}
        {isError && (
          <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600 mb-6">
            Не удалось загрузить дневники.{' '}
            <button
              onClick={() => refetch()}
              className="underline font-semibold hover:text-red-700"
            >
              Повторить попытку
            </button>
            <pre className="text-xs text-red-400 mt-2 whitespace-pre-wrap break-words">
              {String((error as Error)?.message ?? '')}
            </pre>
          </div>
        )}

        {!isLoading && diaries.length > 0 && !isError && (
          <div className="mb-6">
            <Input
              placeholder="Поиск по имени подопечного..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
            />
          </div>
        )}

        {/* Загрузка */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-primary border-t-transparent rounded-full"></div>
            <p className="ml-4 font-manrope text-gray-600">Загрузка дневников...</p>
          </div>
        )}

        {/* Пустое состояние */}
        {!isLoading && diaries.length === 0 && !isError && (
          <div className="text-center py-8">
            {/* Иконка документа в круге */}
            <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'linear-gradient(180deg, #7DD3DC 0%, #5CBCC7 100%)' }}>
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-dark mb-2">
              У вас пока нет дневников
            </h2>
            <p className="text-sm font-manrope text-gray-600 mb-6">
              {isCaregiver
                ? 'Здесь появится дневник подопечного после того, как клиент зарегистрируется и создаст его.'
                : isEmployee
                  ? 'Организация ещё не создала дневники. Как только доступ появится, вы увидите их здесь.'
                : 'Создайте первый дневник для подопечного'}
            </p>
          </div>
        )}

        {/* Список дневников */}
        {!isLoading && filteredDiaries.length > 0 && !isError && (
          <div className="space-y-3">
            {filteredDiaries.map((diary) => (
              <div
                key={diary.id}
                onClick={() => handleDiaryClick(diary.id)}
                className="bg-white rounded-2xl shadow-md p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-dark mb-1">
                    {diary.patient_card?.full_name || 'Неизвестный'}
                  </h3>
                  <div className="text-sm text-gray-600 space-y-0.5">
                    {computeAge(diary.patient_card?.date_of_birth ?? null) !== null && (
                      <p>Возраст: {computeAge(diary.patient_card?.date_of_birth ?? null)}</p>
                  )}
                    <p>Адрес: {diary.patient_card?.address || 'Адрес не указан'}</p>
                  </div>
                </div>
                <img
                  src="/icons/иконка маленькая стрелка.png"
                  alt=""
                  className="w-5 h-5 ml-4 flex-shrink-0 object-contain"
                />
              </div>
            ))}
          </div>
        )}

        {/* Нет результатов поиска */}
        {!isLoading && diaries.length > 0 && filteredDiaries.length === 0 && !isError && (
          <div className="text-center py-12">
            <p className="font-manrope text-gray-600">
              Дневники по запросу "{searchQuery}" не найдены
            </p>
          </div>
        )}
      </div>

      {/* Кнопка создания нового дневника внизу страницы (fixed) */}
      {!isLoading && !isError && !isCaregiver && !isEmployee && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-100 p-4 shadow-lg max-w-md mx-auto">
          <Button
            onClick={handleCreateDiary}
            fullWidth
          >
            + Создать новый дневник
          </Button>
        </div>
      )}
    </div>
  )
}

