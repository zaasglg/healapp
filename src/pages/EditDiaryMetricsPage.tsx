import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Button, Input, Modal } from '@/components/ui'

interface DiaryMetric {
  id: string
  diary_id: string
  metric_type: string
  is_pinned: boolean
}

interface CustomMetric {
  id: string
  diary_id: string
  label: string
  category: 'care' | 'physical' | 'excretion' | 'symptom'
}

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

const CUSTOM_CATEGORY_OPTIONS = [
  { value: 'care', label: 'Уход' },
  { value: 'physical', label: 'Физические' },
  { value: 'excretion', label: 'Выделения' },
  { value: 'symptom', label: 'Симптомы' },
] as const

export const EditDiaryMetricsPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [selectedPinned, setSelectedPinned] = useState<string[]>([])
  const [selectedAll, setSelectedAll] = useState<string[]>([])
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([])
  const [showPinnedModal, setShowPinnedModal] = useState(false)
  const [showAllModal, setShowAllModal] = useState(false)
  const [newCustomMetric, setNewCustomMetric] = useState('')
  const [customMetricCategory, setCustomMetricCategory] = useState<'care' | 'physical' | 'excretion' | 'symptom'>('care')

  useEffect(() => {
    if (!user || !id) {
      navigate('/login')
      return
    }

    // Проверка прав доступа
    const currentUser = JSON.parse(localStorage.getItem('current_user') || '{}')
    const userRole = currentUser.user_role || user.user_metadata?.user_role
    const organizationType = currentUser.organization_type || user.user_metadata?.organization_type

    // Частные сиделки НЕ могут редактировать показатели
    if (organizationType === 'caregiver') {
      alert('У вас нет прав на редактирование показателей дневника')
      navigate(`/diaries/${id}`)
      return
    }

    // Сотрудники организаций НЕ могут редактировать показатели
    if (userRole === 'org_employee') {
      alert('У вас нет прав на редактирование показателей дневника')
      navigate(`/diaries/${id}`)
      return
    }

    // Загружаем текущие показатели дневника
    const allMetrics = JSON.parse(localStorage.getItem('diary_metrics') || '[]') as DiaryMetric[]
    const diaryMetrics = allMetrics.filter(m => m.diary_id === id)

    const storedCustomMetrics = JSON.parse(localStorage.getItem('diary_custom_metrics') || '[]') as CustomMetric[]
    const diaryCustomMetrics = storedCustomMetrics.filter(metric => metric.diary_id === id)

    // Разделяем на закрепленные и все остальные
    const pinned = diaryMetrics.filter(m => m.is_pinned).map(m => m.metric_type)
    const all = diaryMetrics.filter(m => !m.is_pinned).map(m => m.metric_type)

    setSelectedPinned(pinned)
    setSelectedAll(all)
    setCustomMetrics(diaryCustomMetrics)
  }, [id, user, navigate])

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

  const handleAddCustomMetric = () => {
    if (!id) return

    const trimmedMetric = newCustomMetric.trim()
    if (!trimmedMetric) {
      return
    }

    const customId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const newMetric: CustomMetric = {
      id: customId,
      diary_id: id,
      label: trimmedMetric,
      category: customMetricCategory,
    }

    setCustomMetrics(prev => [...prev, newMetric])
    setSelectedAll(prev => [...new Set([...prev, customId])])
    setNewCustomMetric('')
  }

  const handleSave = () => {
    if (selectedPinned.length === 0 && selectedAll.length === 0) {
      alert('Необходимо выбрать хотя бы один показатель')
      return
    }

    // Получаем текущие метрики
    const allMetrics = JSON.parse(localStorage.getItem('diary_metrics') || '[]') as DiaryMetric[]
    
    // Удаляем старые метрики этого дневника
    const otherMetrics = allMetrics.filter(m => m.diary_id !== id)
    
    // Создаем новые метрики
    const newMetrics: DiaryMetric[] = [
      ...selectedPinned.map(type => ({
        id: crypto.randomUUID(),
        diary_id: id!,
        metric_type: type,
        is_pinned: true,
      })),
      ...selectedAll.map(type => ({
        id: crypto.randomUUID(),
        diary_id: id!,
        metric_type: type,
        is_pinned: false,
      })),
    ]

    // Сохраняем пользовательские показатели
    const storedCustomMetrics = JSON.parse(localStorage.getItem('diary_custom_metrics') || '[]') as CustomMetric[]
    const otherCustomMetrics = storedCustomMetrics.filter(metric => metric.diary_id !== id)
    const activeMetricIds = new Set(newMetrics.map(metric => metric.metric_type))
    const activeCustomMetrics = customMetrics.filter(metric => activeMetricIds.has(metric.id))
    localStorage.setItem('diary_custom_metrics', JSON.stringify([...otherCustomMetrics, ...activeCustomMetrics]))

    // Сохраняем обновленные метрики
    localStorage.setItem('diary_metrics', JSON.stringify([...otherMetrics, ...newMetrics]))

    alert('Показатели успешно обновлены')
    navigate(`/diaries/${id}`)
  }

  const getMetricLabel = (value: string) => {
    const baseMetric = [...CARE_METRICS, ...PHYSICAL_METRICS, ...EXCRETION_METRICS, ...SYMPTOM_METRICS].find(metric => metric.value === value)
    if (baseMetric) {
      return baseMetric.label
    }

    const customMetric = customMetrics.find(metric => metric.id === value)
    return customMetric?.label || value
  }

  const getMetricButtonClasses = (isSelected: boolean, isDisabled: boolean) => {
    let classes = 'px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 '

    if (isDisabled) {
      classes += 'bg-gray-200 text-gray-400 border border-gray-200 cursor-not-allowed'
    } else if (isSelected) {
      classes += 'bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white shadow border border-transparent'
    } else {
      classes += 'bg-white text-[#4A4A4A] border-2 border-gray-300 hover:border-[#7DD3DC]'
    }

    return classes
  }

  const renderMetricButtons = (
    metrics: { value: string; label: string }[],
    selectedValues: string[],
    toggle: (value: string) => void,
    options?: { isDisabled?: (value: string, isSelected: boolean) => boolean }
  ) => (
    <div className="flex flex-wrap gap-2">
      {metrics.map(metric => {
        const isSelected = selectedValues.includes(metric.value)
        const isDisabled = options?.isDisabled ? options.isDisabled(metric.value, isSelected) : false

        return (
          <button
            key={metric.value}
            type="button"
            onClick={() => {
              if (!isDisabled) {
                toggle(metric.value)
              }
            }}
            className={getMetricButtonClasses(isSelected, isDisabled)}
            disabled={isDisabled}
          >
            {metric.label}
          </button>
        )
      })}
    </div>
  )

  const careMetricsOptions = [
    ...CARE_METRICS,
    ...customMetrics
      .filter(metric => metric.category === 'care')
      .map(metric => ({ value: metric.id, label: metric.label })),
  ]

  const physicalMetricsOptions = [
    ...PHYSICAL_METRICS,
    ...customMetrics
      .filter(metric => metric.category === 'physical')
      .map(metric => ({ value: metric.id, label: metric.label })),
  ]

const excretionMetricsOptions = [
  ...EXCRETION_METRICS,
  ...customMetrics
    .filter(metric => metric.category === 'excretion')
    .map(metric => ({ value: metric.id, label: metric.label })),
]

  const symptomMetricsOptions = [
    ...SYMPTOM_METRICS,
    ...customMetrics
      .filter(metric => metric.category === 'symptom')
      .map(metric => ({ value: metric.id, label: metric.label })),
  ]

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/diaries/${id}`)}
              className="-ml-2 flex items-center justify-center w-6 h-6"
              aria-label="Назад"
            >
              <img
                src="/icons/Иконка стрелка.png"
                alt="Назад"
                className="w-full h-full object-contain"
              />
            </button>
            <h1 className="text-lg font-bold text-gray-dark">Изменить показатели</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-6 max-w-md mx-auto">
        {/* Закрепленные показатели */}
        <div className="mb-6">
          <div className="bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] rounded-3xl p-6 shadow-md">
            <h2 className="text-xl font-bold text-[#4A4A4A] mb-3 text-center">
              Закрепленные показатели
            </h2>
            <p className="text-sm text-[#4A4A4A] mb-4 text-center">
              Выберите до 3-х показателей для быстрого доступа
            </p>
            <Button
              variant="outline"
              className="w-full !bg-[#4A4A4A] !text-white !border-none"
              onClick={() => setShowPinnedModal(true)}
            >
              Изменить ({selectedPinned.length}/3)
            </Button>
          </div>
        </div>

        {/* Все показатели */}
        <div className="mb-6">
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
              Изменить ({selectedAll.length})
            </Button>
          </div>
        </div>

        {/* Кнопка сохранить */}
        <Button
          onClick={handleSave}
          disabled={selectedPinned.length === 0 && selectedAll.length === 0}
          className="w-full"
        >
          Сохранить изменения
        </Button>
      </div>

      {/* Модальное окно для закрепленных показателей */}
      <Modal isOpen={showPinnedModal} onClose={() => setShowPinnedModal(false)} title="Закрепленные показатели">
        <div className="space-y-6">
          <p className="text-sm text-[#4A4A4A] text-center">
            Выберите до 3-х показателей для быстрого доступа ({selectedPinned.length}/3)
          </p>

          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-[#4A4A4A] mb-2">Показатели ухода</h3>
              {renderMetricButtons(careMetricsOptions, selectedPinned, handlePinnedToggle, {
                isDisabled: (_value, isSelected) => !isSelected && selectedPinned.length >= 3,
              })}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#4A4A4A] mb-2">Физические показатели</h3>
              {renderMetricButtons(physicalMetricsOptions, selectedPinned, handlePinnedToggle, {
                isDisabled: (_value, isSelected) => !isSelected && selectedPinned.length >= 3,
              })}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#4A4A4A] mb-2">Выделение мочи и кала</h3>
              {renderMetricButtons(excretionMetricsOptions, selectedPinned, handlePinnedToggle, {
                isDisabled: (_value, isSelected) => !isSelected && selectedPinned.length >= 3,
              })}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#4A4A4A] mb-2">Тягостные симптомы</h3>
              {renderMetricButtons(symptomMetricsOptions, selectedPinned, handlePinnedToggle, {
                isDisabled: (_value, isSelected) => !isSelected && selectedPinned.length >= 3,
              })}
            </div>
          </div>

          <Button onClick={() => setShowPinnedModal(false)} className="w-full">
            Сохранить
          </Button>
        </div>
      </Modal>

      {/* Модальное окно для всех показателей */}
      <Modal isOpen={showAllModal} onClose={() => setShowAllModal(false)} title="Все показатели">
        <div className="space-y-6">
          <p className="text-sm text-[#4A4A4A] text-center">
            Выберите показатели для отслеживания ({selectedAll.length})
          </p>

          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-[#4A4A4A] mb-2">Показатели ухода</h3>
              {renderMetricButtons(careMetricsOptions, selectedAll, handleAllToggle, {
                isDisabled: (value) => selectedPinned.includes(value),
              })}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#4A4A4A] mb-2">Физические показатели</h3>
              {renderMetricButtons(physicalMetricsOptions, selectedAll, handleAllToggle, {
                isDisabled: (value) => selectedPinned.includes(value),
              })}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#4A4A4A] mb-2">Выделение мочи и кала</h3>
              {renderMetricButtons(excretionMetricsOptions, selectedAll, handleAllToggle, {
                isDisabled: (value) => selectedPinned.includes(value),
              })}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#4A4A4A] mb-2">Тягостные симптомы</h3>
              {renderMetricButtons(symptomMetricsOptions, selectedAll, handleAllToggle, {
                isDisabled: (value) => selectedPinned.includes(value),
              })}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#4A4A4A]">Добавить свой показатель</h3>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_CATEGORY_OPTIONS.map(option => {
                const isActive = customMetricCategory === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCustomMetricCategory(option.value)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white shadow'
                        : 'bg-white border-2 border-gray-300 text-[#4A4A4A] hover:border-[#7DD3DC]'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCustomMetric}
                onChange={(e) => setNewCustomMetric(e.target.value)}
                placeholder="Название показателя"
                className="flex-1"
              />
              <Button onClick={handleAddCustomMetric} disabled={!newCustomMetric.trim()}>
                Добавить
              </Button>
            </div>
          </div>

          <Button onClick={() => setShowAllModal(false)} className="w-full">
            Сохранить
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default EditDiaryMetricsPage


