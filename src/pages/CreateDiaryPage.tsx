import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { Button, Modal, Input } from '@/components/ui'

type OrganizationType = 'pension' | 'patronage_agency' | 'caregiver'

interface PatientCard {
  id: string
  client_id: string
  full_name: string
  date_of_birth: string | null
  gender: 'male' | 'female'
  diagnoses: string[]
  mobility: 'walks' | 'sits' | 'lies'
}

// interface Diary {
//   id: string
//   owner_id: string
//   client_id: string
//   patient_card_id: string
//   caregiver_id: string | null
//   organization_id: string | null
//   organization_type: OrganizationType | null
//   created_at: string
// }

const CARE_METRICS = [
  { value: 'walk', label: 'Прогулка' },
  { value: 'cognitive_games', label: 'Когнитивные игры' },
  { value: 'diaper_change', label: 'Смена подгузников' },
  { value: 'hygiene', label: 'Гигиена' },
  { value: 'skin_moisturizing', label: 'Увлажнение кожи' },
  { value: 'meal', label: 'Прием пищи' },
  { value: 'medications', label: 'Прием лекарств' },
  { value: 'vitamins', label: 'Прием витаминов' },
  { value: 'sleep', label: 'Сон' },
]

const PHYSICAL_METRICS = [
  { value: 'temperature', label: 'Температура' },
  { value: 'blood_pressure', label: 'Артериальное давление' },
  { value: 'breathing_rate', label: 'Частота дыхания' },
  { value: 'pain_level', label: 'Уровень боли' },
  { value: 'saturation', label: 'Сатурация' },
  { value: 'blood_sugar', label: 'Уровень сахара в крови' },
]

const EXCRETION_METRICS = [
  { value: 'urination', label: 'Выпито/выделено и цвет мочи' },
  { value: 'defecation', label: 'Дефекация' },
]

const SYMPTOM_METRICS = [
  { value: 'nausea', label: 'Тошнота' },
  { value: 'vomiting', label: 'Рвота' },
  { value: 'shortness_of_breath', label: 'Одышка' },
  { value: 'itching', label: 'Зуд' },
  { value: 'cough', label: 'Кашель' },
  { value: 'dry_mouth', label: 'Сухость во рту' },
  { value: 'hiccups', label: 'Икота' },
  { value: 'taste_disturbance', label: 'Нарушение вкуса' },
]

export const CreateDiaryPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [availableCards, setAvailableCards] = useState<PatientCard[]>([])
  const [selectedPinned, setSelectedPinned] = useState<string[]>([])
  const [selectedAll, setSelectedAll] = useState<string[]>([])
  const [showPinnedModal, setShowPinnedModal] = useState(false)
  const [showAllModal, setShowAllModal] = useState(false)
  // const [newCustomMetric, setNewCustomMetric] = useState('')
  // const [customMetricCategory, setCustomMetricCategory] = useState<'care' | 'physical' | 'excretion' | 'symptom'>('care')
  const [customCareMetrics, setCustomCareMetrics] = useState<string[]>([])
  const [customPhysicalMetrics, setCustomPhysicalMetrics] = useState<string[]>([])
  const [customExcretionMetrics, setCustomExcretionMetrics] = useState<string[]>([])
  const [customSymptomMetrics, setCustomSymptomMetrics] = useState<string[]>([])
  const [newCareMetric, setNewCareMetric] = useState('')
  const [newPhysicalMetric, setNewPhysicalMetric] = useState('')
  const [newExcretionMetric, setNewExcretionMetric] = useState('')
  const [newSymptomMetric, setNewSymptomMetric] = useState('')

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    // Проверяем, является ли пользователь сотрудником организации
    const userRole = user.user_metadata?.user_role || user.user_metadata?.role
    if (userRole === 'org_employee') {
      // Сотрудники организаций не могут создавать дневники
      alert('У вас нет прав на создание дневников. Обратитесь к администратору организации.')
      navigate('/dashboard')
      return
    }

    // Загружаем доступные карточки из Supabase
    const loadAvailableCards = async () => {
      try {
        // Определяем тип пользователя
        const userRole = user.user_metadata?.user_role
        const organizationType = user.user_metadata?.organization_type

        // Загружаем карточки из Supabase
        let cardsQuery = supabase
          .from('patient_cards')
          .select('*')

        if (userRole === 'client') {
          // Клиенты видят только свои карточки
          cardsQuery = cardsQuery.eq('client_id', user.id)
        } else if (organizationType === 'pension' || organizationType === 'patronage_agency') {
          // Организации видят карточки своих клиентов (RLS политика сама отфильтрует)
          // Не добавляем фильтр, полагаемся на RLS
        }

        const { data: allCards, error: cardsError } = await cardsQuery

        if (cardsError) {
          console.error('Ошибка загрузки карточек:', cardsError)
          alert('Не удалось загрузить карточки подопечных. Попробуйте позже.')
          setAvailableCards([])
          return
        }

        // Загружаем существующие дневники из Supabase
        const { data: allDiaries, error: diariesError } = await supabase
          .from('diaries')
          .select('patient_card_id')

        if (diariesError) {
          console.error('Ошибка загрузки дневников:', diariesError)
          // Используем только карточки без проверки дневников
          setAvailableCards((allCards || []).map((card: any) => ({
            id: card.id,
            client_id: card.client_id || '',
            full_name: card.full_name,
            date_of_birth: card.date_of_birth,
            gender: card.gender as 'male' | 'female',
            diagnoses: Array.isArray(card.diagnoses) ? card.diagnoses : [],
            mobility: card.mobility as 'walks' | 'sits' | 'lies',
          })))
          return
        }

        // Получаем ID карточек, для которых уже есть дневники
        const cardsWithDiaries = new Set(
          (allDiaries || []).map((d: any) => d.patient_card_id).filter(Boolean)
        )

        // Фильтруем карточки, для которых еще нет дневников
        const available = (allCards || [])
          .filter((card: any) => !cardsWithDiaries.has(card.id))
          .map((card: any) => ({
            id: card.id,
            client_id: card.client_id || '',
            full_name: card.full_name,
            date_of_birth: card.date_of_birth,
            gender: card.gender as 'male' | 'female',
            diagnoses: Array.isArray(card.diagnoses) ? card.diagnoses : [],
            mobility: card.mobility as 'walks' | 'sits' | 'lies',
          }))

        setAvailableCards(available)
      } catch (error) {
        console.error('Error loading patient cards:', error)
        alert('Не удалось загрузить карточки подопечных. Попробуйте позже.')
        setAvailableCards([])
      }
    }

    loadAvailableCards()
  }, [user, navigate])

  const handlePinnedToggle = (metricValue: string) => {
    setSelectedPinned(prev =>
      prev.includes(metricValue)
        ? prev.filter(v => v !== metricValue)
        : prev.length < 3
        ? [...prev, metricValue]
        : prev
    )
  }

  const handleAllToggle = (metricValue: string) => {
    setSelectedAll(prev =>
      prev.includes(metricValue)
        ? prev.filter(v => v !== metricValue)
        : [...prev, metricValue]
    )
  }

  // const handleAddCustomMetric = () => {
  //   if (newCustomMetric.trim()) {
  //     const customValue = `custom_${Date.now()}`
  //     setSelectedAll([...selectedAll, customValue])
  //     setNewCustomMetric('')
  //   }
  // }

  const handleAddCareMetric = () => {
    if (newCareMetric.trim() && !customCareMetrics.includes(newCareMetric.trim())) {
      setCustomCareMetrics([...customCareMetrics, newCareMetric.trim()])
      setNewCareMetric('')
    }
  }

  const handleAddPhysicalMetric = () => {
    if (newPhysicalMetric.trim() && !customPhysicalMetrics.includes(newPhysicalMetric.trim())) {
      setCustomPhysicalMetrics([...customPhysicalMetrics, newPhysicalMetric.trim()])
      setNewPhysicalMetric('')
    }
  }

  const handleAddExcretionMetric = () => {
    if (newExcretionMetric.trim() && !customExcretionMetrics.includes(newExcretionMetric.trim())) {
      setCustomExcretionMetrics([...customExcretionMetrics, newExcretionMetric.trim()])
      setNewExcretionMetric('')
    }
  }

  const handleAddSymptomMetric = () => {
    if (newSymptomMetric.trim() && !customSymptomMetrics.includes(newSymptomMetric.trim())) {
      setCustomSymptomMetrics([...customSymptomMetrics, newSymptomMetric.trim()])
      setNewSymptomMetric('')
    }
  }

  const handleRemoveCustomMetric = (category: 'care' | 'physical' | 'excretion' | 'symptom', metric: string) => {
    if (category === 'care') {
      setCustomCareMetrics(customCareMetrics.filter(m => m !== metric))
      setSelectedPinned(selectedPinned.filter(m => m !== `custom_care_${metric}`))
      setSelectedAll(selectedAll.filter(m => m !== `custom_care_${metric}`))
    } else if (category === 'physical') {
      setCustomPhysicalMetrics(customPhysicalMetrics.filter(m => m !== metric))
      setSelectedPinned(selectedPinned.filter(m => m !== `custom_physical_${metric}`))
      setSelectedAll(selectedAll.filter(m => m !== `custom_physical_${metric}`))
    } else if (category === 'excretion') {
      setCustomExcretionMetrics(customExcretionMetrics.filter(m => m !== metric))
      setSelectedPinned(selectedPinned.filter(m => m !== `custom_excretion_${metric}`))
      setSelectedAll(selectedAll.filter(m => m !== `custom_excretion_${metric}`))
    } else {
      setCustomSymptomMetrics(customSymptomMetrics.filter(m => m !== metric))
      setSelectedPinned(selectedPinned.filter(m => m !== `custom_symptom_${metric}`))
      setSelectedAll(selectedAll.filter(m => m !== `custom_symptom_${metric}`))
    }
  }

  // const handleNext = () => {
  //   if (step === 1) {
  //     if (!selectedCardId) {
  //       alert('Выберите карточку подопечного')
  //       return
  //     }
  //     window.scrollTo({ top: 0, behavior: 'smooth' })
  //     setStep(2)
  //   }
  // }

  const handleBack = () => {
    if (step === 2) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setStep(1)
    } else {
      navigate('/dashboard')
    }
  }

  const handleCreate = async () => {
    if (selectedPinned.length === 0 && selectedAll.length === 0) {
      alert('Необходимо выбрать хотя бы один показатель')
      return
    }

    if (!selectedCardId || !user) return

    const selectedCard = availableCards.find(card => card.id === selectedCardId)
    if (!selectedCard) {
      alert('Не удалось найти выбранную карточку подопечного')
      return
    }

    try {
      // Определяем тип пользователя из user_metadata
      const userRole = user.user_metadata?.user_role
      const organizationType = user.user_metadata?.organization_type as OrganizationType | undefined

      // Для организаций и сотрудников получаем organization_id из Supabase
      let organizationId: string | null = null
      if (organizationType === 'pension' || organizationType === 'patronage_agency') {
        // Для организаций organization_id = user.id (user_id организации)
        organizationId = user.id
      } else if (userRole === 'org_employee') {
        // Для сотрудников загружаем organization_id из organization_employees
        try {
          const { data: employeeData, error: empError } = await supabase
            .from('organization_employees')
            .select('organization_id')
            .eq('user_id', user.id)
            .maybeSingle()
          
          if (!empError && employeeData) {
            organizationId = employeeData.organization_id
          }
        } catch (error) {
          console.error('Ошибка загрузки organization_id для сотрудника:', error)
        }
      }

      let caregiverId: string | null = null
      if (organizationType === 'caregiver') {
        // ВАЖНО: Для сиделки нужно получить id из таблицы organizations, а не использовать user.id
        // user.id - это user_id из auth.users, а caregiver_id должен быть id из organizations
        try {
          const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', 'caregiver')
            .maybeSingle()
          
          if (!orgError && orgData) {
            caregiverId = orgData.id
            console.log('[CreateDiaryPage] Загружен caregiver_id для сиделки:', caregiverId)
          } else if (orgError) {
            console.error('Ошибка загрузки caregiver_id для сиделки:', orgError)
          }
        } catch (error) {
          console.error('Ошибка загрузки caregiver_id для сиделки:', error)
        }
      } else if (userRole === 'client') {
        // Для клиентов загружаем caregiver_id из clients
        try {
          const { data: clientData, error: clientError } = await supabase
            .from('clients')
            .select('invited_by_caregiver_id')
            .eq('user_id', user.id)
            .maybeSingle()
          
          if (!clientError && clientData) {
            caregiverId = clientData.invited_by_caregiver_id
          }
        } catch (error) {
          console.error('Ошибка загрузки caregiver_id для клиента:', error)
        }
      }

      // Подготавливаем метрики для RPC
      // Для пользовательских показателей сохраняем label и category в metadata
      const getMetricMetadata = (metricKey: string) => {
        // Проверяем, является ли это пользовательским показателем
        if (metricKey.startsWith('custom_care_')) {
          const label = metricKey.replace('custom_care_', '')
          return { label, category: 'care' }
        } else if (metricKey.startsWith('custom_physical_')) {
          const label = metricKey.replace('custom_physical_', '')
          return { label, category: 'physical' }
        } else if (metricKey.startsWith('custom_excretion_')) {
          const label = metricKey.replace('custom_excretion_', '')
          return { label, category: 'excretion' }
        } else if (metricKey.startsWith('custom_symptom_')) {
          const label = metricKey.replace('custom_symptom_', '')
          return { label, category: 'symptom' }
        }
        return {}
      }

      const metrics = [
        ...selectedPinned.map(metricKey => ({
          metric_key: metricKey,
          is_pinned: true,
          metadata: getMetricMetadata(metricKey),
        })),
        ...selectedAll.map(metricKey => ({
          metric_key: metricKey,
          is_pinned: false,
          metadata: getMetricMetadata(metricKey),
        })),
      ]

      // Создаем дневник через RPC
      const { data: diary, error: diaryError } = await supabase.rpc('create_diary', {
        p_patient_card_id: selectedCardId,
        p_metrics: metrics,
        p_organization_id: organizationId,
        p_organization_type: organizationType ?? null,
        p_caregiver_id: caregiverId,
      })

      if (diaryError) {
        console.error('Ошибка создания дневника:', diaryError)
        alert(diaryError.message || 'Ошибка при создании дневника')
        return
      }

      if (!diary || !diary.id) {
        alert('Не удалось создать дневник. Попробуйте позже.')
        return
      }

      navigate(`/diaries/${diary.id}`)
    } catch (error) {
      console.error('Error creating diary:', error)
      alert('Ошибка при создании дневника')
    }
  }

  // const selectedCard = availableCards.find(c => c.id === selectedCardId)
  // const allAvailableMetrics = [...CARE_METRICS, ...PHYSICAL_METRICS, ...EXCRETION_METRICS, ...SYMPTOM_METRICS]

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="-ml-2 flex items-center justify-center w-6 h-6"
              aria-label="Назад"
            >
              <img
                src="/icons/Иконка стрелка.png"
                alt="Назад"
                className="w-full h-full object-contain"
              />
            </button>
            <h1 className="text-lg font-bold text-gray-dark">
              {step === 1 ? 'Выберите карточку подопечного' : 'Выберите показатели'}
            </h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-6 max-w-md mx-auto pb-24">
        {/* Step 1: Выбор карточки */}
        {step === 1 && (
          <div className="space-y-4">
            {availableCards.length === 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                <p className="text-red-800 font-semibold mb-2">Нет доступных карточек</p>
                <p className="text-red-600 text-sm mb-4">
                  Создайте карточку подопечного, чтобы начать вести дневник
                </p>
                <Button onClick={() => navigate('/profile/patient-cards/new')}>
                  Создать новую карточку
                </Button>
              </div>
            ) : (
              <>
                {/* Подсказка */}
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4">
                  <p className="text-blue-800 text-sm text-center">
                    Выберите карточку подопечного, для которого вы хотите создать дневник
                  </p>
                </div>

                {availableCards.map(card => (
                  <button
                    key={card.id}
                    onClick={() => {
                      setSelectedCardId(card.id)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                      setStep(2)
                    }}
                    className={`w-full bg-white rounded-2xl p-4 shadow-sm text-left transition-all relative ${
                      selectedCardId === card.id
                        ? 'border-2 border-[#7DD3DC]'
                        : 'border-2 border-transparent hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-dark mb-2">{card.full_name}</h3>
                        {card.date_of_birth && (
                          <p className="text-sm text-gray-600">
                            Дата рождения: {new Date(card.date_of_birth).toLocaleDateString('ru-RU')}
                          </p>
                        )}
                        <p className="text-sm text-gray-600">
                          Пол: {card.gender === 'male' ? 'Мужской' : 'Женский'}
                        </p>
                      </div>
                      <img
                        src="/icons/иконка маленькая стрелка.png"
                        alt=""
                        className="w-4 h-4 ml-4"
                      />
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Step 2: Выбор показателей */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Подсказка для закрепленных показателей */}
            <div className="bg-transparent border border-[#7DD3DC] rounded-2xl p-3">
              <p className="text-[#4A4A4A] text-xs text-center font-medium">
                Для <strong>закрепленных показателей</strong> лучше выбирать показатели, которые нужно замерять через определенный промежуток времени: давление, пульс, температура и др.
              </p>
            </div>

            {/* Закрепленные показатели */}
            <div className="bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] rounded-3xl p-6 shadow-md">
              <h2 className="text-xl font-bold text-white mb-3 text-center">
                Закрепленные показатели
              </h2>
              <p className="text-sm text-white opacity-90 mb-4 text-center">
                Выберите до 3-х показателей для быстрого доступа с таймером заполнения
              </p>
              <Button
                variant="outline"
                className="w-full !bg-white !text-[#5CBCC7] !border-none"
                onClick={() => setShowPinnedModal(true)}
              >
                Выбрать ({selectedPinned.length}/3)
              </Button>
            </div>

            {/* Все показатели */}
            <div className="bg-white rounded-3xl p-6 shadow-md border-2 border-gray-300">
              <h2 className="text-xl font-bold text-gray-dark mb-3 text-center">
                Все показатели
              </h2>
              <p className="text-sm text-gray-600 mb-4 text-center">
                Выберите остальные показатели для отслеживания
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowAllModal(true)}
              >
                Выбрать ({selectedAll.length})
              </Button>
            </div>

            {/* Кнопка создания */}
            <Button
              onClick={handleCreate}
              disabled={selectedPinned.length === 0 && selectedAll.length === 0}
              className="w-full"
            >
              Создать дневник
            </Button>
          </div>
        )}
      </div>

      {/* Модальное окно для закрепленных показателей */}
      <Modal isOpen={showPinnedModal} onClose={() => setShowPinnedModal(false)} title="Выбор показателей (закрепленных)">
        <div className="space-y-6">
          <p className="text-sm text-gray-600 text-center">
            Чтобы закрепить параметры которые важно не забывать отслеживать - нажмите на него и нажмите на кнопку выбрать, доступно не более 3 параметров
          </p>
          
          <div>
            <h3 className="font-bold text-gray-dark mb-3">Показатели ухода</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {CARE_METRICS.map(metric => (
                <button
                  key={metric.value}
                  type="button"
                  onClick={() => handlePinnedToggle(metric.value)}
                  disabled={!selectedPinned.includes(metric.value) && selectedPinned.length >= 3}
                  className={`px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                    selectedPinned.includes(metric.value)
                      ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                      : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {metric.label}
                </button>
              ))}
              {customCareMetrics.map(metric => (
                <div key={metric} className="relative">
                  <button
                    type="button"
                    onClick={() => handlePinnedToggle(`custom_care_${metric}`)}
                    disabled={!selectedPinned.includes(`custom_care_${metric}`) && selectedPinned.length >= 3}
                    className={`w-full px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                      selectedPinned.includes(`custom_care_${metric}`)
                        ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                        : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {metric}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomMetric('care', metric)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCareMetric}
                onChange={(e) => setNewCareMetric(e.target.value)}
                placeholder="Добавить показатель не из списка"
                className="flex-1 bg-white"
              />
              <Button
                type="button"
                onClick={handleAddCareMetric}
                className="!bg-[#7DD3DC] !text-white px-6"
              >
                +
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-dark mb-3">Физические показатели</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {PHYSICAL_METRICS.map(metric => (
                <button
                  key={metric.value}
                  type="button"
                  onClick={() => handlePinnedToggle(metric.value)}
                  disabled={!selectedPinned.includes(metric.value) && selectedPinned.length >= 3}
                  className={`px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                    selectedPinned.includes(metric.value)
                      ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                      : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {metric.label}
                </button>
              ))}
              {customPhysicalMetrics.map(metric => (
                <div key={metric} className="relative">
                  <button
                    type="button"
                    onClick={() => handlePinnedToggle(`custom_physical_${metric}`)}
                    disabled={!selectedPinned.includes(`custom_physical_${metric}`) && selectedPinned.length >= 3}
                    className={`w-full px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                      selectedPinned.includes(`custom_physical_${metric}`)
                        ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                        : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {metric}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomMetric('physical', metric)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newPhysicalMetric}
                onChange={(e) => setNewPhysicalMetric(e.target.value)}
                placeholder="Добавить показатель не из списка"
                className="flex-1 bg-white"
              />
              <Button
                type="button"
                onClick={handleAddPhysicalMetric}
                className="!bg-[#7DD3DC] !text-white px-6"
              >
                +
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-dark mb-3">Выделение мочи и кала</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {EXCRETION_METRICS.map(metric => (
                <button
                  key={metric.value}
                  type="button"
                  onClick={() => handlePinnedToggle(metric.value)}
                  disabled={!selectedPinned.includes(metric.value) && selectedPinned.length >= 3}
                  className={`px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                    selectedPinned.includes(metric.value)
                      ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                      : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {metric.label}
                </button>
              ))}
              {customExcretionMetrics.map(metric => (
                <div key={metric} className="relative">
                  <button
                    type="button"
                    onClick={() => handlePinnedToggle(`custom_excretion_${metric}`)}
                    disabled={!selectedPinned.includes(`custom_excretion_${metric}`) && selectedPinned.length >= 3}
                    className={`w-full px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                      selectedPinned.includes(`custom_excretion_${metric}`)
                        ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                        : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {metric}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomMetric('excretion', metric)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newExcretionMetric}
                onChange={(e) => setNewExcretionMetric(e.target.value)}
                placeholder="Добавить показатель не из списка"
                className="flex-1 bg-white"
              />
              <Button
                type="button"
                onClick={handleAddExcretionMetric}
                className="!bg-[#7DD3DC] !text-white px-6"
              >
                +
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-dark mb-3">Тягостные симптомы</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {SYMPTOM_METRICS.map(metric => (
                <button
                  key={metric.value}
                  type="button"
                  onClick={() => handlePinnedToggle(metric.value)}
                  disabled={!selectedPinned.includes(metric.value) && selectedPinned.length >= 3}
                  className={`px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                    selectedPinned.includes(metric.value)
                      ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                      : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {metric.label}
                </button>
              ))}
              {customSymptomMetrics.map(metric => (
                <div key={metric} className="relative">
                  <button
                    type="button"
                    onClick={() => handlePinnedToggle(`custom_symptom_${metric}`)}
                    disabled={!selectedPinned.includes(`custom_symptom_${metric}`) && selectedPinned.length >= 3}
                    className={`w-full px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                      selectedPinned.includes(`custom_symptom_${metric}`)
                        ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                        : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {metric}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomMetric('symptom', metric)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSymptomMetric}
                onChange={(e) => setNewSymptomMetric(e.target.value)}
                placeholder="Добавить показатель не из списка"
                className="flex-1 bg-white"
              />
              <Button
                type="button"
                onClick={handleAddSymptomMetric}
                className="!bg-[#7DD3DC] !text-white px-6"
              >
                +
              </Button>
            </div>
          </div>

          <Button 
            onClick={() => setShowPinnedModal(false)} 
            className="w-full !bg-gradient-to-r !from-[#7DD3DC] !to-[#5CBCC7] !text-white font-bold py-4 !rounded-3xl"
          >
            Выбрать
          </Button>
        </div>
      </Modal>

      {/* Модальное окно для всех показателей */}
      <Modal isOpen={showAllModal} onClose={() => setShowAllModal(false)} title="Выбор показателей">
        <div className="space-y-6">
          <p className="text-sm text-gray-600 text-center">
            Чтобы выбрать индивидуальные параметры которые важно отслеживать - нажмите на него и после выбора всех необходимых нажмите на кнопку выбрать
          </p>
          
          <div>
            <h3 className="font-bold text-gray-dark mb-3">Показатели ухода</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {CARE_METRICS.map(metric => (
                <button
                  key={metric.value}
                  type="button"
                  onClick={() => handleAllToggle(metric.value)}
                  disabled={selectedPinned.includes(metric.value)}
                  className={`px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                    selectedAll.includes(metric.value)
                      ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                      : selectedPinned.includes(metric.value)
                      ? 'bg-gray-200 text-gray-500 border-2 border-gray-300'
                      : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {metric.label}
                </button>
              ))}
              {customCareMetrics.map(metric => (
                <div key={`custom_care_${metric}`} className="relative">
                  <button
                    type="button"
                    onClick={() => handleAllToggle(`custom_care_${metric}`)}
                    disabled={selectedPinned.includes(`custom_care_${metric}`)}
                    className={`w-full px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                      selectedAll.includes(`custom_care_${metric}`)
                        ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                        : selectedPinned.includes(`custom_care_${metric}`)
                        ? 'bg-gray-200 text-gray-500 border-2 border-gray-300'
                        : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {metric}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomMetric('care', metric)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCareMetric}
                onChange={(e) => setNewCareMetric(e.target.value)}
                placeholder="Добавить показатель не из списка"
                className="flex-1 bg-white"
              />
              <Button
                type="button"
                onClick={handleAddCareMetric}
                className="!bg-[#7DD3DC] !text-white px-6"
              >
                +
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-dark mb-3">Физические показатели</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {PHYSICAL_METRICS.map(metric => (
                <button
                  key={metric.value}
                  type="button"
                  onClick={() => handleAllToggle(metric.value)}
                  disabled={selectedPinned.includes(metric.value)}
                  className={`px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                    selectedAll.includes(metric.value)
                      ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                      : selectedPinned.includes(metric.value)
                      ? 'bg-gray-200 text-gray-500 border-2 border-gray-300'
                      : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {metric.label}
                </button>
              ))}
              {customPhysicalMetrics.map(metric => (
                <div key={`custom_physical_${metric}`} className="relative">
                  <button
                    type="button"
                    onClick={() => handleAllToggle(`custom_physical_${metric}`)}
                    disabled={selectedPinned.includes(`custom_physical_${metric}`)}
                    className={`w-full px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                      selectedAll.includes(`custom_physical_${metric}`)
                        ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                        : selectedPinned.includes(`custom_physical_${metric}`)
                        ? 'bg-gray-200 text-gray-500 border-2 border-gray-300'
                        : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {metric}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomMetric('physical', metric)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newPhysicalMetric}
                onChange={(e) => setNewPhysicalMetric(e.target.value)}
                placeholder="Добавить показатель не из списка"
                className="flex-1 bg-white"
              />
              <Button
                type="button"
                onClick={handleAddPhysicalMetric}
                className="!bg-[#7DD3DC] !text-white px-6"
              >
                +
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-dark mb-3">Выделение мочи и кала</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {EXCRETION_METRICS.map(metric => (
                <button
                  key={metric.value}
                  type="button"
                  onClick={() => handleAllToggle(metric.value)}
                  disabled={selectedPinned.includes(metric.value)}
                  className={`px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                    selectedAll.includes(metric.value)
                      ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                      : selectedPinned.includes(metric.value)
                      ? 'bg-gray-200 text-gray-500 border-2 border-gray-300'
                      : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {metric.label}
                </button>
              ))}
              {customExcretionMetrics.map(metric => (
                <div key={`custom_excretion_${metric}`} className="relative">
                  <button
                    type="button"
                    onClick={() => handleAllToggle(`custom_excretion_${metric}`)}
                    disabled={selectedPinned.includes(`custom_excretion_${metric}`)}
                    className={`w-full px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                      selectedAll.includes(`custom_excretion_${metric}`)
                        ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                        : selectedPinned.includes(`custom_excretion_${metric}`)
                        ? 'bg-gray-200 text-gray-500 border-2 border-gray-300'
                        : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {metric}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomMetric('excretion', metric)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newExcretionMetric}
                onChange={(e) => setNewExcretionMetric(e.target.value)}
                placeholder="Добавить показатель не из списка"
                className="flex-1 bg-white"
              />
              <Button
                type="button"
                onClick={handleAddExcretionMetric}
                className="!bg-[#7DD3DC] !text-white px-6"
              >
                +
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-dark mb-3">Тягостные симптомы</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {SYMPTOM_METRICS.map(metric => (
                <button
                  key={metric.value}
                  type="button"
                  onClick={() => handleAllToggle(metric.value)}
                  disabled={selectedPinned.includes(metric.value)}
                  className={`px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                    selectedAll.includes(metric.value)
                      ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                      : selectedPinned.includes(metric.value)
                      ? 'bg-gray-200 text-gray-500 border-2 border-gray-300'
                      : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {metric.label}
                </button>
              ))}
              {customSymptomMetrics.map(metric => (
                <div key={`custom_symptom_${metric}`} className="relative">
                  <button
                    type="button"
                    onClick={() => handleAllToggle(`custom_symptom_${metric}`)}
                    disabled={selectedPinned.includes(`custom_symptom_${metric}`)}
                    className={`w-full px-4 py-3 rounded-3xl text-sm font-semibold transition-all ${
                      selectedAll.includes(`custom_symptom_${metric}`)
                        ? 'bg-[#A0D9E3] text-[#4A4A4A] border-2 border-[#A0D9E3]'
                        : selectedPinned.includes(`custom_symptom_${metric}`)
                        ? 'bg-gray-200 text-gray-500 border-2 border-gray-300'
                        : 'bg-white text-[#4A4A4A] border-2 border-[#7DD3DC]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {metric}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomMetric('symptom', metric)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSymptomMetric}
                onChange={(e) => setNewSymptomMetric(e.target.value)}
                placeholder="Добавить показатель не из списка"
                className="flex-1 bg-white"
              />
              <Button
                type="button"
                onClick={handleAddSymptomMetric}
                className="!bg-[#7DD3DC] !text-white px-6"
              >
                +
              </Button>
            </div>
          </div>

          <Button 
            onClick={() => setShowAllModal(false)} 
            className="w-full !bg-gradient-to-r !from-[#7DD3DC] !to-[#5CBCC7] !text-white font-bold py-4 !rounded-3xl"
          >
            Выбрать
          </Button>
        </div>
      </Modal>

      {/* Кнопка создания новой карточки внизу для шага 1 */}
      {step === 1 && availableCards.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white pb-6 pt-4 px-4 z-10 shadow-lg border-t border-gray-200">
          <div className="max-w-md mx-auto">
            <Button
              onClick={() => navigate('/profile/patient-cards/new')}
              className="w-full !bg-gradient-to-r !from-[#7DD3DC] !to-[#5CBCC7] !text-white font-bold py-4 !rounded-3xl text-base shadow-md"
            >
              Создать новую карточку
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CreateDiaryPage
























