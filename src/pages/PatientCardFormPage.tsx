import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/store/authStore'
import { Button, Input } from '@/components/ui'

const GENDERS = ['male', 'female'] as const
const MOBILITY_OPTIONS = ['walks', 'sits', 'lies'] as const

const patientCardSchema = z.object({
  full_name: z.string().min(1, 'Введите ФИО'),
  date_of_birth: z.string().optional(),
  address: z.string().optional(),
  entrance: z.string().optional(),
  apartment: z.string().optional(),
  gender: z.enum(GENDERS),
  has_pets: z.boolean(),
  diagnoses: z.array(z.string()),
  mobility: z.enum(MOBILITY_OPTIONS),
  services: z.array(z.string()),
  service_wishes: z.array(z.string()),
})

type PatientCardFormData = z.infer<typeof patientCardSchema>

interface PatientCard {
  id: string
  client_id: string
  full_name: string
  date_of_birth: string | null
  address: string | null
  entrance: string | null
  apartment: string | null
  gender: 'male' | 'female'
  has_pets: boolean
  diagnoses: string[]
  mobility: 'walks' | 'sits' | 'lies'
  services: string[]
  service_wishes: string[]
}

const DIAGNOSES_OPTIONS = [
  'Деменция',
  'Паркинсон',
  'Альцгеймер',
  'Инсульт',
  'Инфаркт',
  'Перелом шейки бедра',
]

const SERVICES_OPTIONS = [
  'Растирание конечностей',
  'Развивающие игры',
  'Интересный досуг',
  'Напоминать о приеме лекарств',
  'Помощь в кормлении',
  'Мерять давление',
  'Уборка',
  'Стирка',
  'Уколы',
  'Капельницы',
  'Лечение пролежней',
  'Перевязки',
]

export const PatientCardFormPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const cardId = searchParams.get('id')
  const mode = searchParams.get('mode') || 'edit' // 'edit' or 'view'
  const isEditMode = !!cardId
  const isViewMode = mode === 'view'

  const [expandedSection, setExpandedSection] = useState<'personal' | 'diagnoses' | 'services' | null>(null)
  const [customDiagnosis, setCustomDiagnosis] = useState('')
  const [customService, setCustomService] = useState('')
  const [customWish, setCustomWish] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const currentUserData = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('current_user') || '{}')
    } catch {
      return {}
    }
  }, [])

  const resolvedUserRole = currentUserData.user_role || user?.user_metadata?.user_role
  const resolvedOrganizationType =
    currentUserData.organization_type || user?.user_metadata?.organization_type
  const isClientUser = resolvedUserRole === 'client'
  const isPension = resolvedOrganizationType === 'pension'

  // Проверка прав доступа
  const canEdit = () => {
    if (isViewMode) return false
    if (resolvedUserRole === 'client') return true
    if (resolvedOrganizationType === 'pension' || resolvedOrganizationType === 'patronage_agency') return true
    if (resolvedOrganizationType === 'caregiver') return false
    if (resolvedUserRole === 'org_employee') return false

    return false
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
    getValues,
  } = useForm<PatientCardFormData>({
    resolver: zodResolver(patientCardSchema),
    defaultValues: {
      full_name: '',
      date_of_birth: '',
      address: '',
      entrance: '',
      apartment: '',
      diagnoses: [],
      services: [],
      service_wishes: [],
      gender: 'male',
      has_pets: false,
      mobility: 'walks',
    },
  })

  const draftKey = cardId ? `patient_card_draft_${cardId}` : 'patient_card_draft_new'

  const selectedDiagnoses = (watch('diagnoses') ?? []) as string[]
  const selectedServices = (watch('services') ?? []) as string[]
  const serviceWishes = (watch('service_wishes') ?? []) as string[]
  const selectedGender = watch('gender') ?? GENDERS[0]
  const hasPets = watch('has_pets') ?? false
  const selectedMobility = watch('mobility') ?? MOBILITY_OPTIONS[0]

const sanitizeStringArray = (value?: (string | null | undefined)[]): string[] =>
  (value ?? []).filter((item): item is string => typeof item === 'string' && item.trim().length > 0)

const sanitizeFormValues = (values: Partial<PatientCardFormData>): PatientCardFormData => ({
  full_name: values.full_name ?? '',
  date_of_birth: values.date_of_birth ?? '',
  address: values.address ?? '',
  entrance: values.entrance ?? '',
  apartment: values.apartment ?? '',
  gender: values.gender ?? GENDERS[0],
  has_pets: values.has_pets ?? false,
  diagnoses: sanitizeStringArray(values.diagnoses),
  services: sanitizeStringArray(values.services),
  service_wishes: sanitizeStringArray(values.service_wishes),
  mobility: values.mobility ?? MOBILITY_OPTIONS[0],
})

  useEffect(() => {
    const cards = JSON.parse(localStorage.getItem('patient_cards') || '[]') as PatientCard[]

    let initialValues: Partial<PatientCardFormData> = {}

    if (isEditMode && cardId) {
      const card = cards.find(c => c.id === cardId)
        
        if (card) {
        initialValues = {
          full_name: card.full_name,
          date_of_birth: card.date_of_birth || '',
            address: card.address || '',
            entrance: card.entrance || '',
            apartment: card.apartment || '',
          gender: card.gender,
          has_pets: card.has_pets,
          diagnoses: card.diagnoses || [],
          services: card.services || [],
          service_wishes: card.service_wishes || [],
          mobility: card.mobility || 'walks',
        }
      }
    }

    const draft = localStorage.getItem(draftKey)
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as Partial<PatientCardFormData>
        initialValues = { ...initialValues, ...parsed }
      } catch (error) {
        console.warn('Не удалось загрузить черновик карточки', error)
      }
    }

    reset(sanitizeFormValues(initialValues))
  }, [isEditMode, cardId, reset, draftKey])

  useEffect(() => {
    const subscription = watch(values => {
      localStorage.setItem(
        draftKey,
        JSON.stringify(sanitizeFormValues(values as Partial<PatientCardFormData>))
      )
    })
    return () => subscription.unsubscribe()
  }, [watch, draftKey])

  // Для пансионатов автоматически устанавливаем has_pets в false
  useEffect(() => {
    if (isPension) {
      setValue('has_pets', false, { shouldValidate: true })
    }
  }, [isPension, setValue])

  const handleDiagnosisToggle = (diagnosis: string) => {
    const current = selectedDiagnoses
    if (current.includes(diagnosis)) {
      setValue('diagnoses', current.filter(d => d !== diagnosis))
    } else {
      setValue('diagnoses', [...current, diagnosis])
  }
  }

  const handleServiceToggle = (service: string) => {
    const current = selectedServices
    if (current.includes(service)) {
      setValue('services', current.filter(s => s !== service), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      })
    } else {
      setValue('services', [...current, service], {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      })
  }
  }

  const handleAddCustomDiagnosis = () => {
    if (customDiagnosis.trim() && !selectedDiagnoses.includes(customDiagnosis.trim())) {
      setValue('diagnoses', [...selectedDiagnoses, customDiagnosis.trim()], {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      })
      setCustomDiagnosis('')
    }
  }

  const handleAddCustomService = () => {
    if (customService.trim() && !selectedServices.includes(customService.trim())) {
      setValue('services', [...selectedServices, customService.trim()], {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      })
      setCustomService('')
    }
  }

  const handleAddCustomWish = () => {
    if (customWish.trim() && !serviceWishes.includes(customWish.trim())) {
      setValue('service_wishes', [...serviceWishes, customWish.trim()], {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      })
      setCustomWish('')
    }
  }

  const handleRemoveDiagnosis = (diagnosis: string) => {
    setValue('diagnoses', selectedDiagnoses.filter(d => d !== diagnosis), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
  }

  const handleRemoveService = (service: string) => {
    setValue('services', selectedServices.filter(s => s !== service), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
  }

  const handleRemoveWish = (wish: string) => {
    setValue('service_wishes', serviceWishes.filter(w => w !== wish), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
  }

  const resolveClientId = () => {
    const storedUser = JSON.parse(localStorage.getItem('current_user') || 'null')
    const idFromStored =
      storedUser?.id ||
      storedUser?.user_id ||
      storedUser?.user?.id ||
      storedUser?.user_metadata?.user_id

    return user?.id || idFromStored || 'anonymous_client'
  }

  const persistCards = (cards: PatientCard[]) => {
    localStorage.setItem('patient_cards', JSON.stringify(cards))

    const storedUser = JSON.parse(localStorage.getItem('current_user') || 'null')
    if (storedUser) {
      const updatedUser = {
        ...storedUser,
        user_metadata: {
          ...(storedUser.user_metadata || {}),
          patient_cards: cards,
        },
      }
      localStorage.setItem('current_user', JSON.stringify(updatedUser))
    }
  }

  const persistCurrentValues = () => {
    if (!canEdit()) return

    const cards = JSON.parse(localStorage.getItem('patient_cards') || '[]') as PatientCard[]
    const existingCard = cardId ? cards.find(c => c.id === cardId) : undefined
    const clientId = existingCard?.client_id ?? resolveClientId()
    const values = sanitizeFormValues(getValues())

    if (isEditMode && cardId) {
      if (existingCard) {
        const updatedCards = cards.map(c =>
          c.id === cardId
            ? {
                ...c,
                client_id: existingCard.client_id,
                full_name: values.full_name,
                date_of_birth: values.date_of_birth || null,
                address: isPension ? null : values.address || null,
                entrance: isPension ? null : values.entrance || null,
                apartment: isPension ? null : values.apartment || null,
                gender: values.gender,
                has_pets: isPension ? false : values.has_pets,
                diagnoses: values.diagnoses,
                services: values.services,
                service_wishes: values.service_wishes,
                mobility: values.mobility,
              }
            : c
        )
        persistCards(updatedCards)
      }
    } else if (!isEditMode) {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          ...values,
          client_id: clientId,
        })
      )
        }
  }

  const onSubmit: SubmitHandler<PatientCardFormData> = async data => {
    console.log('=== onSubmit вызван ===')
    console.log('canEdit():', canEdit())
    console.log('data:', data)
    
    if (!canEdit()) {
      console.log('canEdit() вернул false, выходим')
      return
    }

    try {
      const cards = JSON.parse(localStorage.getItem('patient_cards') || '[]') as PatientCard[]
      const existingCard = isEditMode && cardId ? cards.find(c => c.id === cardId) : undefined
      const clientId = existingCard?.client_id ?? resolveClientId()
      console.log('clientId:', clientId)

      const cardData: PatientCard = {
        id: cardId || `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        client_id: clientId,
        full_name: data.full_name,
        date_of_birth: data.date_of_birth || null,
        address: isPension ? null : (data.address || null),
        entrance: isPension ? null : (data.entrance || null),
        apartment: isPension ? null : (data.apartment || null),
        gender: data.gender,
        has_pets: isPension ? false : (data.has_pets || false),
        diagnoses: data.diagnoses,
        services: data.services,
        service_wishes: data.service_wishes || [],
        mobility: data.mobility,
      }

      console.log('cardData:', cardData)

      if (isEditMode) {
        console.log('Режим редактирования')
        const updatedCards = cards.map(c => (c.id === cardId ? cardData : c))
        persistCards(updatedCards)
      } else {
        console.log('Режим создания')
        persistCards([...cards, cardData])
      }

      console.log('Удаляем черновик:', draftKey)
      localStorage.removeItem(draftKey)
      
      console.log('Навигация на /profile/patient-cards')
      navigate('/profile/patient-cards')
      console.log('navigate() вызван')
    } catch (error) {
      console.error('Error saving patient card:', error)
      alert('Ошибка при сохранении карточки')
    }
  }

  const handleDelete = async () => {
    if (!cardId || !confirm('Вы уверены, что хотите отвязать эту карточку?')) return

    setIsDeleting(true)
    try {
      const cards = JSON.parse(localStorage.getItem('patient_cards') || '[]') as PatientCard[]
      const updatedCards = cards.filter(c => c.id !== cardId)
      persistCards(updatedCards)
      localStorage.removeItem(draftKey)
    navigate('/profile/patient-cards')
    } catch (error) {
      console.error('Error deleting patient card:', error)
      alert('Ошибка при удалении карточки')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSectionToggle = (section: 'personal' | 'diagnoses' | 'services') => {
    const isCurrentlyOpen = expandedSection === section

    if (isCurrentlyOpen) {
      persistCurrentValues()
      setExpandedSection(null)
    } else {
      setExpandedSection(section)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-32">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="flex items-center px-4 py-3">
          <button
            onClick={() => navigate('/profile/patient-cards')}
            className="flex items-center justify-center w-6 h-6 mr-3"
            aria-label="Назад"
          >
            <img 
              src="/icons/Иконка стрелка.png" 
              alt="Назад" 
              className="w-full h-full object-contain"
            />
          </button>
          <h1 className="text-lg font-bold text-[#4A4A4A]">
            {isViewMode ? 'Просмотр карточки' : isEditMode ? 'Редактировать карточку' : 'Новая карточка пациента'}
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-[#4A4A4A] text-center mb-8">
          Заполните данные<br />пациента
        </h2>

        <form
          id="patient-card-form"
          onSubmit={(event) => {
            void handleSubmit(onSubmit)(event)
          }}
          className="space-y-4"
        >
          {/* Личные данные */}
          <div className="bg-gradient-to-br from-[#A0E7E5] to-[#7DD3DC] rounded-3xl overflow-hidden">
            <button
              type="button"
              onClick={() => handleSectionToggle('personal')}
              className="w-full px-6 py-5"
            >
              <h3 className="text-xl font-bold mb-1 text-[#4A4A4A]">Личные данные</h3>
              {expandedSection !== 'personal' && (
                <p className="text-sm mb-3 text-[#4A4A4A]">ФИО, дата рождения, адрес, пол, животные</p>
              )}
              <div className="flex justify-center">
              <img 
                src="/icons/иконка маленькая стрелка.png" 
                  alt=""
                  className={`w-4 h-4 transition-transform duration-200 ${
                    expandedSection === 'personal' ? '-rotate-90' : 'rotate-90'
                  }`}
                  style={{ filter: 'brightness(0) saturate(100%) invert(29%) sepia(0%) saturate(0%) hue-rotate(174deg) brightness(95%) contrast(88%)' }}
              />
              </div>
            </button>

            {expandedSection === 'personal' && (
              <div className="px-6 pb-6 space-y-4">
                <div>
                  <label className="text-sm font-semibold text-[#4A4A4A] mb-2 block">ФИО пациента</label>
                <Input
                  placeholder="Введите ФИО пациента"
                    {...register('full_name')}
                    error={errors.full_name?.message}
                    className="bg-white"
                    disabled={!canEdit()}
                />
                </div>

                <div>
                  <label className="text-sm font-semibold text-[#4A4A4A] mb-2 block">Дата рождения пациента</label>
                <Input
                  placeholder="Введите дату рождения пациента"
                    type="date"
                    {...register('date_of_birth')}
                    className="bg-white"
                    disabled={!canEdit()}
                  />
                </div>

                {!isPension && (
                  <>
                    <div>
                      <label className="text-sm font-semibold text-[#4A4A4A] mb-2 block">Адрес пациента</label>
                    <Input
                      placeholder="Введите адрес пациента"
                        {...register('address')}
                        className="bg-white"
                        disabled={!canEdit()}
                    />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-semibold text-[#4A4A4A] mb-2 block">Подъезд</label>
                      <Input
                        placeholder="№ подъезда"
                          {...register('entrance')}
                          className="bg-white"
                          disabled={!canEdit()}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-[#4A4A4A] mb-2 block">Квартира</label>
                      <Input
                        placeholder="№ квартиры"
                          {...register('apartment')}
                          className="bg-white"
                          disabled={!canEdit()}
                      />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-sm font-semibold text-[#4A4A4A] mb-2 block">Выберите пол пациента</label>
                  <div className="flex gap-3">
                        <button
                          type="button"
                      onClick={() => canEdit() && setValue('gender', 'male')}
                      disabled={!canEdit()}
                      className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${
                        selectedGender === 'male'
                          ? 'bg-[#4A9BAD] text-white'
                          : 'bg-white text-[#4A4A4A]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          Мужской
                        </button>
                        <button
                          type="button"
                      onClick={() => canEdit() && setValue('gender', 'female')}
                      disabled={!canEdit()}
                      className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${
                        selectedGender === 'female'
                          ? 'bg-[#4A9BAD] text-white'
                          : 'bg-white text-[#4A4A4A]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          Женский
                        </button>
                      </div>
                </div>

                {!isPension && (
                  <div>
                    <label className="text-sm font-semibold text-[#4A4A4A] mb-2 block">Есть ли домашние животные?</label>
                    <div className="flex gap-3">
                          <button
                            type="button"
                        onClick={() => {
                          if (canEdit()) {
                            setValue('has_pets', false)
                          }
                        }}
                        disabled={!canEdit()}
                        className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${
                          hasPets === false
                            ? 'bg-[#4A9BAD] text-white'
                            : 'bg-white text-[#4A4A4A]'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            Нет
                          </button>
                          <button
                            type="button"
                        onClick={() => {
                          if (canEdit()) {
                            setValue('has_pets', true)
                          }
                        }}
                        disabled={!canEdit()}
                        className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${
                          hasPets === true
                            ? 'bg-[#4A9BAD] text-white'
                            : 'bg-white text-[#4A4A4A]'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            Да
                          </button>
                        </div>
                  </div>
                )}

                {canEdit() && (
                <Button
                  type="button"
                    onClick={() => handleSectionToggle('personal')}
                    className="w-full !bg-[#4A9BAD] !text-white font-bold"
                >
                  Готово
                </Button>
                )}
              </div>
            )}
          </div>

          {/* Болезни */}
          <div className="bg-gradient-to-br from-[#5CBCC7] to-[#3D8A9C] rounded-3xl overflow-hidden">
            <button
              type="button"
              onClick={() => handleSectionToggle('diagnoses')}
              className="w-full px-6 py-5 text-white"
            >
              <h3 className="text-xl font-bold mb-1">Болезни</h3>
              {expandedSection !== 'diagnoses' && (
                <p className="text-sm opacity-90 mb-3">Деменция, паркинсон, инсульт, инфаркт и т.д.</p>
              )}
              <div className="flex justify-center">
              <img 
                src="/icons/иконка маленькая стрелка.png" 
                  alt=""
                  className={`w-4 h-4 filter brightness-0 invert transition-transform duration-200 ${
                    expandedSection === 'diagnoses' ? '-rotate-90' : 'rotate-90'
                  }`}
              />
              </div>
            </button>

            {expandedSection === 'diagnoses' && (
              <div className="px-6 pb-6 space-y-4">
                {canEdit() && (
                  <p className="text-sm text-white font-semibold">Выберите болезни, если есть</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {DIAGNOSES_OPTIONS.map(diagnosis => (
                      <button
                        key={diagnosis}
                        type="button"
                      onClick={() => canEdit() && handleDiagnosisToggle(diagnosis)}
                      disabled={!canEdit()}
                      className={`px-4 py-2 rounded-2xl text-sm font-bold transition-all ${
                          selectedDiagnoses.includes(diagnosis)
                          ? 'bg-[#A0D9E3] text-[#4A4A4A]'
                          : 'bg-white text-[#4A4A4A]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {diagnosis}
                      </button>
                    ))}
                </div>

                {selectedDiagnoses.filter(d => !DIAGNOSES_OPTIONS.includes(d)).length > 0 && (
                    <div className="space-y-2">
                    <p className="text-sm text-white font-semibold">Добавленные болезни:</p>
                    {selectedDiagnoses.filter(d => !DIAGNOSES_OPTIONS.includes(d)).map(diagnosis => (
                      <div
                        key={diagnosis}
                        className="flex items-center justify-between bg-white/20 rounded-2xl px-4 py-2"
                      >
                        <span className="text-white font-medium text-sm">{diagnosis}</span>
                        {canEdit() && (
                            <button
                              type="button"
                            onClick={() => handleRemoveDiagnosis(diagnosis)}
                            className="text-white hover:text-red-300 ml-2"
                            >
                            <span className="text-lg">🗑</span>
                            </button>
                        )}
                          </div>
                        ))}
                  </div>
                )}

                {canEdit() && (
                <div className="flex gap-2">
                    <Input
                    value={customDiagnosis}
                    onChange={(e) => setCustomDiagnosis(e.target.value)}
                    placeholder="Добавить болезнь не из списка"
                      className="flex-1 bg-white"
                  />
                    <Button
                    type="button"
                      onClick={handleAddCustomDiagnosis}
                      className="!bg-[#A0D9E3] !text-[#4A4A4A] !px-6"
                  >
                    +
                    </Button>
                </div>
                )}

                <div>
                  <label className="text-sm font-semibold text-white mb-2 block">Мобильность</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'walks', label: 'Ходит' },
                      { value: 'sits', label: 'Сидит' },
                      { value: 'lies', label: 'Лежит' },
                    ].map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          if (canEdit()) {
                            setValue('mobility', option.value as 'walks' | 'sits' | 'lies', {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            })
                          }
                        }}
                        disabled={!canEdit()}
                        className={`flex-1 py-2 rounded-2xl text-sm font-bold transition-all ${
                          selectedMobility === option.value
                            ? 'bg-[#A0D9E3] text-[#4A4A4A]'
                            : 'bg-white text-[#4A4A4A]'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {canEdit() && (
                <Button
                  type="button"
                    onClick={() => handleSectionToggle('diagnoses')}
                    className="w-full !bg-[#A0D9E3] !text-[#4A4A4A] font-bold"
                >
                  Готово
                </Button>
                )}
              </div>
            )}
          </div>

          {/* Требуемые услуги */}
          <div className="bg-gradient-to-br from-[#3D8A9C] to-[#2A6B7A] rounded-3xl overflow-hidden">
            <button
              type="button"
              onClick={() => handleSectionToggle('services')}
              className="w-full px-6 py-5 text-white"
            >
              <h3 className="text-xl font-bold mb-1">Требуемые услуги</h3>
              {expandedSection !== 'services' && (
                <p className="text-sm opacity-90 mb-3">Уколы, стирка, уборка, мерять давление и т.д.</p>
              )}
              <div className="flex justify-center">
              <img 
                src="/icons/иконка маленькая стрелка.png" 
                  alt=""
                  className={`w-4 h-4 filter brightness-0 invert transition-transform duration-200 ${
                    expandedSection === 'services' ? '-rotate-90' : 'rotate-90'
                  }`}
              />
              </div>
            </button>

            {expandedSection === 'services' && (
              <div className="px-6 pb-6 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {SERVICES_OPTIONS.map(service => (
                    <button
                      key={service}
                      type="button"
                      onClick={() => canEdit() && handleServiceToggle(service)}
                      disabled={!canEdit()}
                      className={`px-4 py-2 rounded-2xl text-sm font-bold transition-all ${
                        selectedServices.includes(service)
                          ? 'bg-[#A0D9E3] text-[#4A4A4A]'
                          : 'bg-white text-[#4A4A4A]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {service}
                    </button>
                  ))}
                </div>

                {selectedServices.filter(service => !SERVICES_OPTIONS.includes(service)).length > 0 && (
                    <div className="space-y-2">
                    <p className="text-sm text-white font-semibold">Добавленные услуги:</p>
                      {selectedServices
                      .filter(service => !SERVICES_OPTIONS.includes(service))
                      .map(service => (
                        <div
                          key={service}
                          className="flex items-center justify-between bg-white/20 rounded-2xl px-4 py-2"
                        >
                          <span className="text-white font-medium text-sm">{service}</span>
                          {canEdit() && (
                            <button
                              type="button"
                              onClick={() => handleRemoveService(service)}
                              className="text-white hover:text-red-300 ml-2"
                            >
                              <span className="text-lg">🗑</span>
                            </button>
                          )}
                          </div>
                        ))}
                    </div>
                )}

                {serviceWishes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-white font-semibold">Добавленные пожелания:</p>
                    {serviceWishes.map(wish => (
                      <div
                        key={wish}
                        className="flex items-center justify-between bg-white/20 rounded-2xl px-4 py-2"
                      >
                        <span className="text-white font-medium text-sm">{wish}</span>
                        {canEdit() && (
                          <button
                            type="button"
                            onClick={() => handleRemoveWish(wish)}
                            className="text-white hover:text-red-300 ml-2"
                          >
                            <span className="text-lg">🗑</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canEdit() && (
                  <>
                <div className="flex gap-2">
                      <Input
                    value={customService}
                    onChange={(e) => setCustomService(e.target.value)}
                    placeholder="Добавить свою услугу"
                        className="flex-1 bg-white"
                  />
                      <Button
                    type="button"
                        onClick={handleAddCustomService}
                        className="!bg-[#A0D9E3] !text-[#4A4A4A] !px-6"
                  >
                    +
                      </Button>
                </div>

                <div className="flex gap-2">
                      <Input
                    value={customWish}
                    onChange={(e) => setCustomWish(e.target.value)}
                    placeholder="Добавить пожелание"
                        className="flex-1 bg-white"
                  />
                      <Button
                    type="button"
                        onClick={handleAddCustomWish}
                        className="!bg-[#A0D9E3] !text-[#4A4A4A] !px-6"
                  >
                    +
                      </Button>
                </div>

                <Button
                  type="button"
                      onClick={() => handleSectionToggle('services')}
                      className="w-full !bg-[#A0D9E3] !text-[#4A4A4A] font-bold"
                >
                  Готово
                </Button>
                  </>
                )}
            </div>
          )}
          </div>
        </form>
      </div>

      {/* Кнопка Сохранить внизу */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#F3F4F6] pb-6 pt-4 px-4 z-10">
        <div className="max-w-md mx-auto">
        <Button
          type="button"
            onClick={() => {
              console.log('=== Кнопка Сохранить нажата ===')
              console.log('errors:', errors)
              console.log('isSubmitting:', isSubmitting)
              console.log('canEdit():', canEdit())
              handleSubmit(
                (data) => {
                  console.log('Валидация прошла успешно')
                  return onSubmit(data)
                },
                (errors) => {
                  console.log('Ошибки валидации:', errors)
                  const errorMessages: string[] = []
                  if (errors.full_name) errorMessages.push('ФИО пациента')
                  if (errors.gender) errorMessages.push('Пол пациента')
                  if (errors.mobility) errorMessages.push('Мобильность')
                  if (errors.has_pets) errorMessages.push('Наличие животных')
                  if (errors.address) errorMessages.push('Адрес')
                  if (errors.entrance) errorMessages.push('Подъезд')
                  if (errors.apartment) errorMessages.push('Квартира')
                  
                  alert('Пожалуйста, заполните обязательные поля:\n\n' + errorMessages.join('\n'))
                }
              )()
            }}
            disabled={isSubmitting || !canEdit()}
            className="w-full !bg-gradient-to-r !from-[#7DD3DC] !to-[#5CBCC7] !text-white font-bold py-3.5 !rounded-3xl"
        >
            {isSubmitting ? 'Сохранение...' : 'Сохранить'}
        </Button>

          {canEdit() && isEditMode && !isClientUser && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full mt-4 text-sm font-semibold text-[#4A4A4A] disabled:opacity-50"
        >
              {isDeleting ? 'Удаление...' : 'Отвязать карточку'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PatientCardFormPage
















