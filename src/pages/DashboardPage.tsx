import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button, Input } from '@/components/ui'

// Тип для дневника (пока используем mock данные, позже из БД)
interface Diary {
  id: string
  patient_name: string
  created_at: string
  entries_count?: number
  patient_card_id?: string
  patient_age?: number | null
  patient_address?: string | null
}

export const DashboardPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')

  const currentUserData = JSON.parse(localStorage.getItem('current_user') || '{}')
  const userRole =
    currentUserData.user_role ||
    user?.user_metadata?.user_role ||
    (user as any)?.user_role ||
    (user as any)?.role
  const organizationType =
    currentUserData.organization_type ||
    user?.user_metadata?.organization_type ||
    (user as any)?.organization_type
  const isEmployee = userRole === 'org_employee' || userRole === 'org_employe'
  const isCaregiver = userRole === 'caregiver' || organizationType === 'caregiver'
  const effectiveCaregiverId =
    currentUserData.caregiver_id ||
    (user as any)?.caregiver_id ||
    user?.user_metadata?.caregiver_id ||
    currentUserData.id ||
    user?.id

  // Загрузка списка дневников (пока mock данные, позже из БД)
  const { data: diaries = [], isLoading } = useQuery<Diary[]>({
    queryKey: ['diaries', user?.id],
    queryFn: async () => {
      if (!user) return []

      // Для сотрудников получаем organization_id
      let organizationId = null
      let organizationType: string | null =
        (user as any).organization_type ||
        user.user_metadata?.organization_type ||
        currentUserData.organization_type ||
        null
      let requiresAssignment = false
      if (isEmployee) {
        organizationId = (user as any).organization_id || user.user_metadata?.organization_id

        if (!organizationType || organizationType === 'temp') {
          try {
            const employeesRaw = localStorage.getItem('local_employees')
            if (employeesRaw) {
              const employees = JSON.parse(employeesRaw)
              if (Array.isArray(employees)) {
                const employeeEntry = employees.find(
                  (entry: any) => String(entry.user_id) === String(user.id)
                )
                if (employeeEntry?.organization_type) {
                  organizationType = employeeEntry.organization_type
                }
              }
            }
          } catch (orgTypeError) {
            console.warn('Dashboard: unable to derive organization_type for employee', orgTypeError)
          }
        }

        requiresAssignment = organizationType === 'patronage_agency'

        // Проверяем, что сотрудник привязан к организации (organization_id не null)
        if (!organizationId || organizationId === 'null' || organizationId === null) {
          // Сотрудник откреплен от организации - нет доступа к дневникам
          console.log('Employee detached from organization, no access to diaries')
          return []
        }

        // Проверяем, что сотрудник все еще в списке сотрудников организации с правильным organization_id
        try {
          const employees = JSON.parse(localStorage.getItem('local_employees') || '[]')
          const employeeExists = employees.some((e: any) =>
            e.user_id === user.id &&
            e.organization_id === organizationId &&
            e.organization_id !== null
          )

          if (!employeeExists) {
            // Сотрудник откреплен от организации - нет доступа к дневникам
            console.log('Employee not linked to organization, no access to diaries')
            return []
          }
        } catch (err) {
          console.error('Error checking employee access:', err)
        }

        if (requiresAssignment) {
          try {
            const assignments = JSON.parse(localStorage.getItem('diary_employee_access') || '{}')
            const diaryIds = Object.keys(assignments || {}).filter(diaryId =>
              Array.isArray(assignments[diaryId]) &&
              assignments[diaryId].some(
                (entry: any) => String(entry.user_id) === String(user.id)
              )
            )
            if (diaryIds.length === 0) {
              console.log('Employee (patronage agency) has no assigned diaries')
              return []
            }
          } catch (error) {
            console.warn('Failed to load diary assignments for employee', error)
            return []
          }
        }
      }

      // Пока используем mock данные, когда будет таблица diaries - заменим на реальный запрос
      try {
        // Пытаемся загрузить из БД (с таймаутом)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 2000) // 2 секунды таймаут
        )

        let query = supabase
          .from('diaries')
          .select(`
            id,
            owner_id,
            created_at,
            caregiver_id,
            diary_patient_cards(name)
          `)
          .order('created_at', { ascending: false })

        // Для сотрудников фильтруем по organization_id
        if (isEmployee && organizationId) {
          // Для сотрудников дневники принадлежат организации (owner_id = organization_id)
          query = query.eq('owner_id', organizationId)
        } else if (isCaregiver) {
          query = query.eq('caregiver_id', user.id)
        } else {
          // Для организаций и сиделок - только их дневники
          query = query.eq('owner_id', user.id)
        }

        const { data, error } = await Promise.race([query, timeoutPromise]) as any

        if (error || !data) {
          // Если таблицы нет или таймаут, загружаем из localStorage
          throw new Error('DB timeout or error, use localStorage')
        }

        // Преобразуем данные из БД
        return data.map((diary: any) => ({
          id: diary.id,
          patient_name: diary.diary_patient_cards?.[0]?.name || 'Неизвестный',
          created_at: diary.created_at,
          entries_count: 0, // TODO: получить количество записей
        }))
      } catch (err) {
        // Таймаут или ошибка - загружаем из localStorage (временное решение)
        console.log('DB query timeout or error, loading from localStorage')

        const extractDiaryId = (diary: any) =>
          diary?.id ??
          diary?.diary_id ??
          diary?.uuid ??
          diary?.slug ??
          diary?.diaryId ??
          (typeof diary === 'string' ? diary : null)

        try {
          const diariesData = JSON.parse(localStorage.getItem('diaries') || '[]')
          const patientCardsData = JSON.parse(localStorage.getItem('patient_cards') || '[]')
          const assignmentsData = JSON.parse(localStorage.getItem('diary_employee_access') || '{}')

          if (isEmployee && !organizationType) {
            const diaryWithType = diariesData.find(
              (d: any) =>
                String(d.organization_id) === String(organizationId) && d.organization_type
            )
            if (diaryWithType?.organization_type) {
              organizationType = diaryWithType.organization_type
              requiresAssignment = organizationType === 'patronage_agency'
            }
          }

          let filteredDiaries: any[] = []

          if (isEmployee && organizationId) {
            // Для сотрудников: дневники организации (где organization_id совпадает)
            filteredDiaries = diariesData.filter((d: any) =>
              String(d.organization_id) === String(organizationId)
            )

            if (requiresAssignment) {
              try {
                const assignedIds = new Set<string>()
                if (assignmentsData && typeof assignmentsData === 'object') {
                  Object.entries(assignmentsData).forEach(([diaryId, entries]) => {
                    if (
                      Array.isArray(entries) &&
                      entries.some(entry => String((entry as any).user_id) === String(user.id))
                    ) {
                      assignedIds.add(diaryId)
                    }
                  })
                }
                filteredDiaries = filteredDiaries.filter((diary: any) => {
                  const diaryId = extractDiaryId(diary)
                  return diaryId ? assignedIds.has(String(diaryId)) : false
                })
              } catch (error) {
                console.warn('Failed to filter assignments for employee (patronage)', error)
                filteredDiaries = []
              }
            }
          } else if (userRole === 'client') {
            // Для клиентов: только их дневники (owner_id = user.id)
            filteredDiaries = diariesData.filter((d: any) =>
              String(d.owner_id) === String(user.id) || String(d.client_id) === String(user.id)
            )
          } else if (isCaregiver) {
            filteredDiaries = diariesData.filter((d: any) =>
              d.caregiver_id && String(d.caregiver_id) === String(effectiveCaregiverId)
            )
          } else {
            // Для организаций: дневники, где owner_id или organization_id соответствует организации
            filteredDiaries = diariesData.filter((d: any) =>
              String(d.owner_id) === String(user.id) || String(d.organization_id) === String(user.id)
            )
          }

          // Преобразуем данные и добавляем информацию о карточке подопечного
          return filteredDiaries.map((diary: any) => {
            const card = patientCardsData.find((c: any) => c.id === diary.patient_card_id)

            // Вычисляем возраст
            let age: number | null = null
            if (card?.date_of_birth) {
              const birthDate = new Date(card.date_of_birth)
              const today = new Date()
              age = today.getFullYear() - birthDate.getFullYear()
              const monthDiff = today.getMonth() - birthDate.getMonth()
              if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--
              }
            }

            return {
              id: extractDiaryId(diary) || diary.id,
              patient_name: card?.full_name || 'Неизвестный',
              created_at: diary.created_at,
              entries_count: 0,
              patient_card_id: diary.patient_card_id,
              patient_age: age,
              patient_address: card?.address || null,
            }
          })
        } catch (localStorageErr) {
          console.error('Error loading from localStorage:', localStorageErr)
          return []
        }
      }
    },
    enabled: !!user,
  })

  // Фильтрация дневников по поисковому запросу
  const filteredDiaries = diaries.filter((diary) =>
    diary.patient_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCreateDiary = () => {
    if (isCaregiver || isEmployee) {
      return
    }
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
        {!isLoading && diaries.length > 0 && (
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
        {!isLoading && diaries.length === 0 && (
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
        {!isLoading && filteredDiaries.length > 0 && (
          <div className="space-y-3">
            {filteredDiaries.map((diary) => (
              <div
                key={diary.id}
                onClick={() => handleDiaryClick(diary.id)}
                className="bg-white rounded-2xl shadow-md p-5 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-dark mb-1">
                    {diary.patient_name}
                  </h3>
                  <div className="text-sm text-gray-600 space-y-0.5">
                    {diary.patient_age !== null && diary.patient_age !== undefined && (
                      <p>Возраст: {diary.patient_age}</p>
                  )}
                    <p>Адрес: {diary.patient_address || 'Адрес не указан'}</p>
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
        {!isLoading && diaries.length > 0 && filteredDiaries.length === 0 && (
          <div className="text-center py-12">
            <p className="font-manrope text-gray-600">
              Дневники по запросу "{searchQuery}" не найдены
            </p>
          </div>
        )}
      </div>

      {/* Кнопка создания нового дневника внизу страницы (fixed) */}
      {!isLoading && !isCaregiver && !isEmployee && (
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

