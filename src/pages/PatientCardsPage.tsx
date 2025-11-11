import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface PatientCard {
  id: string
  client_id: string
  full_name: string
  date_of_birth: string | null
  address: string | null
  gender: 'male' | 'female'
  diagnoses: string[]
  mobility: 'walks' | 'sits' | 'lies'
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

    // Загружаем карточки подопечных
    const loadPatientCards = () => {
      try {
        const allCards = JSON.parse(localStorage.getItem('patient_cards') || '[]') as PatientCard[]
        const allDiaries = JSON.parse(localStorage.getItem('diaries') || '[]') as Array<{
          id: string
          patient_card_id: string
          organization_id: string | null
          caregiver_id: string | null
          owner_id: string
          client_id: string
        }>

        // Определяем тип пользователя
        const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
        const userRole = currentUser.user_role || user.user_metadata?.user_role
        const organizationType = currentUser.organization_type || user.user_metadata?.organization_type
        const organizationId =
          (user as any).organization_id ||
          user.user_metadata?.organization_id ||
          currentUser.organization_id ||
          null
        const caregiverId =
          (user as any).caregiver_id ||
          user.user_metadata?.caregiver_id ||
          currentUser.caregiver_id ||
          null

        let filteredCards: PatientCard[] = []

        if (userRole === 'client') {
          // Клиенты видят только свои карточки
          filteredCards = allCards.filter(card => card.client_id === user.id)
        } else if (userRole === 'org_employee') {
          // Сотрудники организаций видят карточки, привязанные к дневникам их организации
          if (organizationId) {
            const allowedIds = new Set(
              allDiaries
                .filter(diary => String(diary.organization_id) === String(organizationId))
                .map(diary => diary.patient_card_id)
            )
            filteredCards = allCards.filter(card => allowedIds.has(card.id))
          } else {
            filteredCards = []
          }
        } else if (organizationType === 'pension' || organizationType === 'patronage_agency') {
          // Организации видят карточки своих клиентов
          filteredCards = allCards
        } else if (organizationType === 'caregiver') {
          // Частные сиделки видят карточки из дневников, к которым они прикреплены
          const effectiveCaregiverId = caregiverId || user.id
          const allowedIds = new Set(
            allDiaries
              .filter(diary => diary.caregiver_id && String(diary.caregiver_id) === String(effectiveCaregiverId))
              .map(diary => diary.patient_card_id)
          )
          filteredCards = allCards.filter(card => allowedIds.has(card.id))
        }

        setPatientCards(filteredCards)
      } catch (error) {
        console.error('Error loading patient cards:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadPatientCards()
  }, [user, navigate])

  const canCreateCard = () => {
    const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
    const userRole = currentUser.user_role || user?.user_metadata?.user_role
    const organizationType = currentUser.organization_type || user?.user_metadata?.organization_type

    // Клиенты могут создавать карточки
    if (userRole === 'client') return true

    // Организации могут создавать карточки
    if (organizationType === 'pension' || organizationType === 'patronage_agency') return true

    // Частные сиделки НЕ могут создавать карточки
    if (organizationType === 'caregiver') return false

    // Сотрудники организаций НЕ могут создавать карточки
    return false
  }

  const canEditCard = () => {
    const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
    const userRole = currentUser.user_role || user?.user_metadata?.user_role
    const organizationType = currentUser.organization_type || user?.user_metadata?.organization_type

    // Клиенты могут редактировать карточки
    if (userRole === 'client') return true

    // Организации могут редактировать карточки
    if (organizationType === 'pension' || organizationType === 'patronage_agency') return true

    // Частные сиделки НЕ могут редактировать карточки
    if (organizationType === 'caregiver') return false

    // Сотрудники организаций НЕ могут редактировать карточки
    if (userRole === 'org_employee') return false

    return false
  }

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


