import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { canCreateDiariesAndCards, canEditDiariesAndCards } from '@/utils/employeePermissions'

interface PatientCard {
  id: string
  client_id: string | null  // Может быть null для карточек, созданных организациями до регистрации клиента
  full_name: string
  date_of_birth: string | null
  address: string | null
  gender: 'male' | 'female'
  diagnoses: string[]
  mobility: 'walks' | 'sits' | 'lies'
  metadata?: {
    entrance?: string | null
    apartment?: string | null
    has_pets?: boolean
    services?: string[]
    service_wishes?: string[]
    [key: string]: unknown
  } | null
}

export const PatientCardsPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [patientCards, setPatientCards] = useState<PatientCard[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    // Загружаем карточки подопечных из Supabase
    const loadPatientCards = async () => {
      try {
        setIsLoading(true)

        // Определяем тип пользователя
        // const userRole = user.user_metadata?.role || user.user_metadata?.user_role
        // const organizationType = user.user_metadata?.organization_type

        let query = supabase
          .from('patient_cards')
          .select('id, client_id, full_name, date_of_birth, gender, diagnoses, mobility, metadata, created_at')

        // RLS политики автоматически фильтруют карточки по правам доступа
        // Клиенты видят только свои карточки
        // Организации видят карточки своих клиентов
        // Сотрудники видят карточки через дневники организации
        // Сиделки видят карточки через дневники, к которым прикреплены

        const { data, error } = await query.order('created_at', { ascending: false })

        if (error) {
          console.error('Error loading patient cards from Supabase:', error)
          setPatientCards([])
          return
        }

        // Преобразуем данные из Supabase в формат интерфейса
        const cards: PatientCard[] = (data || []).map(card => ({
          id: card.id,
          client_id: card.client_id,
          full_name: card.full_name,
          date_of_birth: card.date_of_birth,
          address: (card.metadata as any)?.address || null,
          gender: (card.gender as 'male' | 'female') || 'male',
          diagnoses: Array.isArray(card.diagnoses) ? card.diagnoses : [],
          mobility: (card.mobility as 'walks' | 'sits' | 'lies') || 'walks',
          metadata: card.metadata as any,
        }))

        setPatientCards(cards)
      } catch (error) {
        console.error('Error loading patient cards:', error)
        setPatientCards([])
      } finally {
        setIsLoading(false)
      }
    }

    loadPatientCards()
  }, [user, navigate])

  const [canCreateCardValue, setCanCreateCardValue] = useState(false)
  const [canEditCardValue, setCanEditCardValue] = useState(false)

  useEffect(() => {
    const checkPermissions = async () => {
      if (!user) {
        setCanCreateCardValue(false)
        setCanEditCardValue(false)
        return
      }
      try {
        const [canCreate, canEdit] = await Promise.all([
          canCreateDiariesAndCards(user),
          canEditDiariesAndCards(user),
        ])
        setCanCreateCardValue(canCreate)
        setCanEditCardValue(canEdit)
      } catch (error) {
        console.error('Ошибка проверки прав доступа:', error)
        setCanCreateCardValue(false)
        setCanEditCardValue(false)
      }
    }
    checkPermissions()
  }, [user])

  const canCreateCard = () => canCreateCardValue
  const canEditCard = () => canEditCardValue

  const calculateAge = (dateOfBirth: string | null) => {
    if (!dateOfBirth) return null
    const birthDate = new Date(dateOfBirth)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">Загрузка...</p>
      </div>
    )
  }

  const allowCreateCard = canCreateCard()

  return (
    <div className="min-h-screen bg-gray-100 pb-32">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="flex items-center px-4 py-3">
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center justify-center w-6 h-6 mr-3"
            aria-label="Назад"
          >
            <img
              src="/icons/Иконка стрелка.png"
              alt="Назад"
              className="w-full h-full object-contain"
            />
          </button>
          <h1 className="text-lg font-bold text-[#4A4A4A]">Карточки подопечных</h1>
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-6 max-w-md mx-auto">
        {patientCards.length === 0 ? (
          // Пустое состояние
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <p className="text-center text-gray-600 px-8 mb-8 leading-relaxed">
              {allowCreateCard
                ? 'Для доступа к дневнику подопечного, сначала заполните карточку подопечного по кнопке ниже'
                : 'Карточки подопечных пока не назначены. Обратитесь к администратору или клиенту, чтобы получить доступ.'}
            </p>
          </div>
        ) : (
          // Список карточек
          <div className="space-y-4">
            {patientCards.map(card => {
              const age = calculateAge(card.date_of_birth)
              
              return (
                <button
                  key={card.id}
                  onClick={() => {
                    if (canEditCard()) {
                      navigate(`/profile/patient-cards/edit?id=${card.id}`)
                    } else {
                      navigate(`/profile/patient-cards/view?id=${card.id}&mode=view`)
                    }
                  }}
                  className="w-full bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between min-h-[100px]"
                >
                  <div className="text-left flex-1">
                    <h3 className="text-lg font-bold text-[#4A4A4A] mb-1">
                      {card.full_name}
                    </h3>
                    {age && (
                      <p className="text-sm text-gray-500 mb-0.5">
                        Возраст: {age}
                      </p>
                    )}
                    {card.address && (
                      <p className="text-sm text-gray-500">
                        Адрес: {card.address}
                      </p>
                    )}
                  </div>
                  <img
                    src="/icons/иконка маленькая стрелка.png"
                    alt=""
                    className="w-4 h-4"
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Кнопка внизу */}
      {allowCreateCard && (
        <div className="fixed bottom-0 left-0 right-0 p-4 max-w-md mx-auto">
          <button
            onClick={() => navigate('/profile/patient-cards/new')}
            className="w-full bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white font-bold py-4 rounded-full shadow-lg"
          >
            {patientCards.length === 0 ? '+ Добавить карточку' : 'Создать новую карточку'}
          </button>
        </div>
      )}
    </div>
  )
}

export default PatientCardsPage


