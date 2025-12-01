import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { TouchEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { PinnedMetricPanel } from '@/components/PinnedMetricPanel'
import type { MetricFillData } from '@/components/MetricFillModal'
import type { DiaryClientLink } from '@/utils/diaryClientLink'
import { canEditDiariesAndCards, canManageClientAccess, canManageEmployeeAccess, canEditDiaryMetrics } from '@/utils/employeePermissions'

// Хук для отслеживания размера экрана
const useWindowWidth = () => {
  const [width, setWidth] = useState<number>(() => 
    typeof window !== 'undefined' ? window.innerWidth : 1920
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleResize = () => {
      setWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return width
}

interface PatientCard {
  id: string
  client_id: string
  full_name: string
  date_of_birth: string | null
  gender: 'male' | 'female'
  diagnoses: string[]
  mobility: 'walks' | 'sits' | 'lies'
  address?: string | null
}

type OrganizationType = 'pension' | 'patronage_agency' | 'caregiver' | null

interface Diary {
  id: string
  owner_id: string
  client_id: string
  patient_card_id: string
  caregiver_id: string | null
  organization_id: string | null
  organization_type?: string | null
  created_at: string
}

interface DiaryMetric {
  id: string
  diary_id: string
  metric_type: string
  is_pinned: boolean
  settings?: MetricSettings
  metadata?: {
    label?: string
    category?: string
    [key: string]: any
  }
}

interface DiaryMetricValue {
  id: string
  diary_id: string
  metric_type: string
  value: string | number | boolean
  created_at: string
}

interface MetricSettings {
  frequency: number
  reminderStart: string
  reminderEnd: string
  times: string[]
}

interface ClientProfile {
  user_id: string
  first_name?: string
  last_name?: string
  phone?: string
  diary_id?: string
  patient_card_id?: string
  organization_id?: string | null
  [key: string]: any
}

type DiaryTab = 'diary' | 'history' | 'route' | 'client' | 'share'

const MINUTES_IN_DAY = 24 * 60

const timeStringToMinutes = (time: string): number => {
  if (!time || typeof time !== 'string') return 0
  const [hoursStr, minutesStr] = time.split(':')
  const hours = Number(hoursStr)
  const minutes = Number(minutesStr)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0
  return ((hours * 60 + minutes) % MINUTES_IN_DAY + MINUTES_IN_DAY) % MINUTES_IN_DAY
}

const minutesToTimeString = (minutes: number): string => {
  const normalized = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY
  const hours = Math.floor(normalized / 60)
  const mins = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

const generateTimes = (frequency: number, start: string, end: string): string[] => {
  const freq = Math.max(1, Math.floor(frequency || 1))
  const startMinutes = timeStringToMinutes(start || '09:00')
  if (freq === 1) {
    return [minutesToTimeString(startMinutes)]
  }
  let endMinutes = timeStringToMinutes(end || '21:00')
  if (endMinutes <= startMinutes) {
    endMinutes += MINUTES_IN_DAY
  }
  const interval = Math.max(1, Math.floor((endMinutes - startMinutes) / (freq - 1)))
  return Array.from({ length: freq }, (_, index) => minutesToTimeString(startMinutes + index * interval))
}

const normalizeSettings = (raw: any): MetricSettings => {
  const baseStart = typeof raw?.reminderStart === 'string' ? raw.reminderStart : '09:00'
  const baseEnd = typeof raw?.reminderEnd === 'string' ? raw.reminderEnd : '21:00'
  let times: string[] = []

  if (Array.isArray(raw?.times)) {
    times = Array.from(
      new Set(
        raw.times
          .map((time: unknown) => String(time ?? '').slice(0, 5))
          .filter((time: string): time is string => Boolean(time) && time.includes(':'))
      )
    ).sort() as string[]
  } else if (typeof raw?.frequency === 'number' && raw.frequency > 0) {
    times = generateTimes(Math.floor(raw.frequency), baseStart, baseEnd)
  }

  if (times.length === 0) {
    return {
      frequency: 0,
      reminderStart: '',
      reminderEnd: '',
      times: [],
    }
  }

  times = Array.from(new Set(times)).sort()

  return {
    frequency: times.length,
    reminderStart: times[0],
    reminderEnd: times[times.length - 1],
    times,
  }
}

const normalizeDiaryMetricValue = (raw: any): DiaryMetricValue | null => {
  if (!raw || typeof raw !== 'object') return null

  const id = raw.id ?? raw.value_id ?? crypto.randomUUID()
  const diaryId = raw.diary_id ?? raw.diaryId
  const metricType = raw.metric_type ?? raw.metricType
  const createdAt = raw.created_at ?? raw.createdAt

  if (!id || !diaryId || !metricType || !createdAt) {
    return null
  }

  let normalizedCreatedAt: string
  try {
    normalizedCreatedAt = new Date(createdAt).toISOString()
  } catch {
    normalizedCreatedAt = new Date().toISOString()
  }

  return {
    id: String(id),
    diary_id: String(diaryId),
    metric_type: String(metricType),
    value: raw.value,
    created_at: normalizedCreatedAt,
  }
}

const mergeDiaryEntries = (entries: any[]): DiaryMetricValue[] => {
  const map = new Map<string, DiaryMetricValue>()

  entries.forEach(rawEntry => {
    const normalized = normalizeDiaryMetricValue(rawEntry)
    if (!normalized) return
    
    // Нормализуем значение для сравнения
    const valueStr = typeof normalized.value === 'object' 
      ? JSON.stringify(normalized.value) 
      : String(normalized.value ?? '')
    
    // Нормализуем время для сравнения (округляем до секунды, чтобы избежать проблем с миллисекундами)
    const timeStr = new Date(normalized.created_at).toISOString().slice(0, 19) + 'Z'
    
    // Используем комбинацию metric_type, value и времени для уникальности (БЕЗ id)
    // Это позволяет дедуплицировать записи из разных источников (diary_metric_values и diary_history)
    const uniqueKey = `${normalized.metric_type}_${valueStr}_${timeStr}`
    
    // Если запись с таким ключом уже есть, пропускаем (дедупликация)
    // Оставляем запись с более ранним ID (первая встреченная)
    if (!map.has(uniqueKey)) {
      map.set(uniqueKey, normalized)
    }
  })

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

const loadDiaryHistoryEntries = async (diaryId: string, date?: string): Promise<DiaryMetricValue[]> => {
  try {
    // Используем RPC для получения истории из Supabase
    const targetDate = date ? new Date(date).toISOString().split('T')[0] : undefined
    const { data, error } = await supabase.rpc('get_diary_history', {
      p_diary_id: diaryId,
      p_date: targetDate || null,
    })

    if (error) {
      console.error('Ошибка загрузки истории:', error)
    return []
  }

    // Преобразуем данные из Supabase в формат DiaryMetricValue
    // Функция возвращает: event_type, payload, recorded_by, occurred_at
    return (data || []).map((item: any) => {
      const payload = item.payload || {}
      
      // Извлекаем значение из payload (может быть объектом { value: ... } или просто значением)
      let extractedValue = payload.value
      if (payload.value && typeof payload.value === 'object' && 'value' in payload.value) {
        extractedValue = payload.value.value
      }
      
      return {
        id: payload.metric_id || `value_${Date.now()}_${Math.random()}`,
        diary_id: diaryId,
        metric_type: payload.metric_key || '',
        value: extractedValue || null,
        created_at: item.occurred_at || new Date().toISOString(),
      }
    })
  } catch (error) {
    console.error('Ошибка загрузки истории:', error)
    return []
  }
}

// persistDiaryHistoryEntries больше не нужна - сохранение идет через RPC save_metric_value

type MetricModalVariant = 'boolean' | 'numeric' | 'pressure' | 'pain' | 'urination' | 'options' | 'text'

interface MetricModalConfig {
  variant: MetricModalVariant
  description?: string
  options?: string[]
  unit?: string
  min?: number
  max?: number
  step?: number
  placeholder?: string
}

const metricModalConfigs: Record<string, MetricModalConfig> = {
  walk: {
    variant: 'boolean',
    description: 'Отметьте, состоялась ли прогулка у подопечного.',
  },
  cognitive_games: {
    variant: 'options',
    description: 'Выберите проведённую активность или добавьте свою.',
    options: ['Чтение', 'Настольные игры', 'Пазлы', 'Разговор', 'Музыка'],
  },
  diaper_change: {
    variant: 'boolean',
    description: 'Отметьте, была ли выполнена смена подгузника.',
  },
  hygiene: {
    variant: 'boolean',
    description: 'Отметьте, проводилась ли гигиена.',
  },
  skin_moisturizing: {
    variant: 'boolean',
    description: 'Отметьте, было ли увлажнение кожи.',
  },
  meal: {
    variant: 'text',
    description: 'Опишите, что ели и как прошёл приём пищи.',
    placeholder: 'Например: завтрак — овсянка, чай',
  },
  medications: {
    variant: 'text',
    description: 'Укажите, какие лекарства были приняты.',
    placeholder: 'Например: принимаем Энап 5 мг',
  },
  vitamins: {
    variant: 'text',
    description: 'Укажите витамины/БАДы и особенности приёма.',
    placeholder: 'Например: витамин D 1000 МЕ',
  },
  sleep: {
    variant: 'text',
    description: 'Опишите длительность и качество сна.',
    placeholder: 'Например: спал c 22:30 до 07:00, крепко',
  },
  temperature: {
    variant: 'numeric',
    description: 'Запишите измеренную температуру тела.',
    unit: '°C',
    min: 30,
    max: 45,
    step: 0.1,
  },
  blood_pressure: {
    variant: 'pressure',
    description: 'Укажите систолическое и диастолическое давление, при необходимости пульс.',
  },
  breathing_rate: {
    variant: 'numeric',
    description: 'Количество вдохов в минуту.',
    unit: 'вдох/мин',
    min: 5,
    max: 60,
  },
  pulse: {
    variant: 'numeric',
    description: 'Укажите частоту пульса.',
    unit: 'уд/мин',
    min: 20,
    max: 220,
    step: 1,
  },
  pain_level: {
    variant: 'pain',
    description: 'Оцените уровень боли по шкале от 0 до 10 и опишите, что беспокоит.',
  },
  saturation: {
    variant: 'numeric',
    description: 'Укажите уровень сатурации кислорода.',
    unit: '%',
    min: 50,
    max: 100,
  },
  blood_sugar: {
    variant: 'numeric',
    description: 'Укажите уровень сахара в крови.',
    unit: 'ммоль/л',
    min: 1,
    max: 30,
    step: 0.1,
  },
  urination: {
    variant: 'urination',
    description: 'Отметьте количество выпитой жидкости, выделенной мочи и её цвет.',
  },
  defecation: {
    variant: 'boolean',
    description: 'Зафиксируйте, была ли дефекация.',
  },
  nausea: { variant: 'boolean', description: 'Отметьте, была ли тошнота.' },
  vomiting: { variant: 'boolean', description: 'Отметьте, была ли рвота.' },
  shortness_of_breath: { variant: 'boolean', description: 'Зафиксируйте появление одышки.' },
  itching: { variant: 'boolean', description: 'Зафиксируйте наличие зуда.' },
  cough: { variant: 'boolean', description: 'Отметьте появление кашля.' },
  dry_mouth: { variant: 'boolean', description: 'Отметьте ощущение сухости во рту.' },
  hiccups: { variant: 'boolean', description: 'Зафиксируйте, была ли икота.' },
  taste_disturbance: { variant: 'boolean', description: 'Отметьте нарушение вкуса.' },
}

const CARE_METRIC_OPTIONS = [
  { value: 'walk', label: 'Прогулка' },
  { value: 'cognitive_games', label: 'Когнитивные игры' },
  { value: 'diaper_change', label: 'Смена подгузников' },
  { value: 'hygiene', label: 'Гигиена' },
  { value: 'skin_moisturizing', label: 'Увлажнение кожи' },
  { value: 'meal', label: 'Прием пищи' },
  { value: 'medications', label: 'Прием лекарств' },
  { value: 'vitamins', label: 'Прием витаминов' },
]

const PHYSICAL_METRIC_OPTIONS = [
  { value: 'temperature', label: 'Температура' },
  { value: 'blood_pressure', label: 'Артериальное давление' },
  { value: 'breathing_rate', label: 'Частота дыхания' },
  { value: 'pain_level', label: 'Уровень боли' },
  { value: 'saturation', label: 'Сатурация' },
  { value: 'blood_sugar', label: 'Уровень сахара в крови' },
    { value: 'urination', label: 'Выпито/выделено и цвет мочи' },
  { value: 'defecation', label: 'Дефекация' },
  { value: 'pulse', label: 'Пульс' },
]

const EXCRETION_METRIC_OPTIONS = [
  { value: 'urination', label: 'Выпито/выделено и цвет мочи' },
  { value: 'defecation', label: 'Дефекация' },
]

const SYMPTOM_METRIC_OPTIONS = [
  { value: 'nausea', label: 'Тошнота' },
  { value: 'vomiting', label: 'Рвота' },
  { value: 'shortness_of_breath', label: 'Одышка' },
  { value: 'itching', label: 'Зуд' },
  { value: 'cough', label: 'Кашель' },
  { value: 'dry_mouth', label: 'Сухость во рту' },
  { value: 'hiccups', label: 'Икота' },
  { value: 'taste_disturbance', label: 'Нарушение вкуса' },
]

const MOBILITY_OPTIONS = [
  { value: 'walks', label: 'Ходит' },
  { value: 'sits', label: 'Сидит' },
  { value: 'lies', label: 'Лежит' },
]

const getMetricConfig = (metricType: string): MetricModalConfig => {
  // Для пользовательских метрик (начинающихся с custom_) используем текстовый ввод
  if (metricType.startsWith('custom_')) {
    return {
      variant: 'text',
      description: 'Запишите значение показателя.',
      placeholder: 'Введите значение',
    }
  }
  
  const defaultConfig: MetricModalConfig = {
    variant: 'boolean',
    description: 'Зафиксируйте состояние показателя.',
  }
  return metricModalConfigs[metricType] || defaultConfig
}

const getCurrentTimeLabel = () =>
  new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

const toInputDate = (date: Date): string => {
  const tzOffset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - tzOffset * 60 * 1000)
  return localDate.toISOString().slice(0, 10)
}

const fromInputDate = (value: string): Date => {
  return value ? new Date(`${value}T00:00:00`) : new Date()
}

interface MetricValueModalProps {
  isOpen: boolean
  metricType: string
  metricLabel: string
  onClose: () => void
  onSave: (value: string | number | boolean) => void
}

const MetricValueModal = ({ isOpen, metricType, metricLabel, onClose, onSave }: MetricValueModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const config = getMetricConfig(metricType)
  const [booleanValue, setBooleanValue] = useState<boolean | null>(null)
  const [numericValue, setNumericValue] = useState<string>('')
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [pulse, setPulse] = useState('')
  const [painValue, setPainValue] = useState(0)
  const [painComment, setPainComment] = useState('')
  const [drinkVolume, setDrinkVolume] = useState('')
  const [urineVolume, setUrineVolume] = useState('')
  const [urineColor, setUrineColor] = useState<'светлая' | 'нормальная' | 'тёмная' | ''>('')
  const [urineNote, setUrineNote] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [customOptions, setCustomOptions] = useState<string[]>([])
  const [customOption, setCustomOption] = useState('')
  const [textValue, setTextValue] = useState('')

  const combinedOptions = useMemo(() => {
    const base = config.options || []
    const extras = customOptions.filter(option => !base.includes(option))
    return [...base, ...extras]
  }, [config.options, customOptions])

  useEffect(() => {
    if (!isOpen) return

    setBooleanValue(null)
    setNumericValue('')
    setSystolic('')
    setDiastolic('')
    setPulse('')
    setPainValue(3)
    setPainComment('')
    setDrinkVolume('')
    setUrineVolume('')
    setUrineColor('')
    setUrineNote('')
    setSelectedOptions([])
    setCustomOptions([])
    setCustomOption('')
    setTextValue('')
  }, [isOpen, metricType])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const addCustomOption = () => {
    const trimmed = customOption.trim()
    if (!trimmed) return
    setSelectedOptions(prev => Array.from(new Set([...prev, trimmed])))
    setCustomOptions(prev => Array.from(new Set([...prev, trimmed])))
    setCustomOption('')
  }

  const toggleOption = (option: string) => {
    setSelectedOptions(prev =>
      prev.includes(option) ? prev.filter(item => item !== option) : [...prev, option]
    )
  }

  const canSave = () => {
    switch (config.variant) {
      case 'boolean':
        return booleanValue !== null
      case 'numeric':
        return numericValue.trim().length > 0
      case 'pressure':
        return systolic.trim().length > 0 && diastolic.trim().length > 0
      case 'pain':
        return painValue >= 0
      case 'urination':
        return drinkVolume.trim().length > 0 || urineVolume.trim().length > 0 || urineColor !== ''
      case 'options':
        return selectedOptions.length > 0 || textValue.trim().length > 0
      case 'text':
        return textValue.trim().length > 0
      default:
        return false
    }
  }

  const handleSave = () => {
    const timeLabel = getCurrentTimeLabel()
    let formatted: string | number | boolean = ''

    switch (config.variant) {
      case 'boolean':
        formatted = `${booleanValue ? 'Было' : 'Не было'} · ${timeLabel}`
        break
      case 'numeric': {
        const unit = config.unit ? ` ${config.unit}` : ''
        formatted = `${numericValue}${unit} · ${timeLabel}`
        break
      }
      case 'pressure': {
        const base = `${systolic}/${diastolic}`
        const pulsePart = pulse ? ` · Пульс ${pulse}` : ''
        formatted = `${base}${pulsePart} · ${timeLabel}`
        break
      }
      case 'pain': {
        const note = painComment.trim() ? ` · ${painComment.trim()}` : ''
        formatted = `Боль ${painValue}/10${note} · ${timeLabel}`
        break
      }
      case 'urination': {
        const parts: string[] = []
        if (drinkVolume.trim()) parts.push(`Выпито ${drinkVolume.trim()} мл`)
        if (urineVolume.trim()) parts.push(`Выделено ${urineVolume.trim()} мл`)
        if (urineColor) parts.push(`Цвет: ${urineColor}`)
        if (urineNote.trim()) parts.push(urineNote.trim())
        formatted = `${parts.join(' / ')} · ${timeLabel}`
        break
      }
      case 'options': {
        const list = [...selectedOptions]
        if (textValue.trim()) list.push(textValue.trim())
        formatted = `${list.join(', ')} · ${timeLabel}`
        break
      }
      case 'text': {
        formatted = `${textValue.trim()} · ${timeLabel}`
        break
      }
      default:
        formatted = ''
    }

    onSave(formatted)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        ref={modalRef}
        className="w-full max-w-sm rounded-[28px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] p-6 space-y-6"
      >
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-[#4A4A4A]">{metricLabel}</h2>
          {config.description && (
            <p className="text-sm text-gray-500 leading-relaxed">{config.description}</p>
          )}
          <p className="text-xs text-gray-400">Время заполнения фиксируется автоматически</p>
        </div>

        {config.variant === 'boolean' && (
          <div className="flex items-center justify-between gap-3">
            {[
              { label: 'Было', value: true },
              { label: 'Не было', value: false },
            ].map(option => {
              const isActive = booleanValue === option.value
              return (
                <button
                  key={option.label}
                  onClick={() => setBooleanValue(option.value)}
                  className={`flex-1 rounded-2xl py-3 text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white shadow-md'
                      : 'bg-white text-[#4A4A4A] border border-[#7DD3DC]'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ROUTE_PICKER_MODAL_DIARYPAGE */}
        

        

        

        

        

        

        

        

        

        {config.variant === 'numeric' && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-[#4A4A4A]">
              Значение
              <Input
                type="number"
                value={numericValue}
                onChange={event => setNumericValue(event.target.value)}
                min={config.min}
                max={config.max}
                step={config.step}
                className="mt-2"
              />
            </label>
          </div>
        )}

        {config.variant === 'pressure' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Систолическое</label>
                <Input
                  type="number"
                  value={systolic}
                  onChange={event => setSystolic(event.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Диастолическое</label>
                <Input
                  type="number"
                  value={diastolic}
                  onChange={event => setDiastolic(event.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide">Пульс (опционально)</label>
              <Input
                type="number"
                value={pulse}
                onChange={event => setPulse(event.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        )}

        {config.variant === 'pain' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Нет боли</span>
              <span className="text-sm font-semibold text-[#4A4A4A]">{painValue}</span>
              <span className="text-sm text-gray-500">Сильная боль</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={painValue}
              onChange={event => setPainValue(Number(event.target.value))}
              className="w-full accent-[#7DD3DC]"
            />
            <textarea
              value={painComment}
              onChange={event => setPainComment(event.target.value)}
              placeholder="Что болит или беспокоит?"
              className="w-full min-h-[72px] rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-[#7DD3DC] focus:outline-none"
            />
          </div>
        )}

        {config.variant === 'urination' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide">Выпито (мл)</label>
              <Input
                type="number"
                value={drinkVolume}
                onChange={event => setDrinkVolume(event.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide">Выделено (мл)</label>
              <Input
                type="number"
                value={urineVolume}
                onChange={event => setUrineVolume(event.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              {['светлая', 'нормальная', 'тёмная'].map(color => {
                const isActive = urineColor === color
                return (
                  <button
                    key={color}
                    onClick={() => setUrineColor(color as typeof urineColor)}
                    className={`flex-1 rounded-2xl py-2 text-xs font-semibold capitalize transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white shadow-md'
                        : 'bg-white text-[#4A4A4A] border border-[#7DD3DC]'
                    }`}
                  >
                    {color}
                  </button>
                )
              })}
            </div>
            <textarea
              value={urineNote}
              onChange={event => setUrineNote(event.target.value)}
              placeholder="Комментарий (опционально)"
              className="w-full min-h-[68px] rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-[#7DD3DC] focus:outline-none"
            />
          </div>
        )}

        {config.variant === 'options' && (
          <div className="space-y-4">
            {combinedOptions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {combinedOptions.map(option => {
                  const isActive = selectedOptions.includes(option)
                  return (
                    <button
                      key={option}
                      onClick={() => toggleOption(option)}
                      className={`px-4 py-2 rounded-2xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white shadow-md'
                          : 'bg-white text-[#4A4A4A] border border-[#7DD3DC]'
                      }`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={customOption}
                onChange={event => setCustomOption(event.target.value)}
                placeholder="Своя активность"
              />
              <button
                onClick={addCustomOption}
                className="px-4 py-2 rounded-2xl bg-[#7DD3DC] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Добавить
              </button>
            </div>
            <textarea
              value={textValue}
              onChange={event => setTextValue(event.target.value)}
              placeholder="Комментарий (опционально)"
              className="w-full min-h-[68px] rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-[#7DD3DC] focus:outline-none"
            />
          </div>
        )}

        {config.variant === 'text' && (
          <div className="space-y-3">
            <Input
              type="text"
              value={textValue}
              onChange={event => setTextValue(event.target.value)}
              placeholder={config.placeholder || 'Введите значение'}
              className="w-full"
            />
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl bg-gray-200 text-[#4A4A4A] font-semibold py-3 hover:bg-gray-300 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave()}
            className="flex-1 rounded-2xl bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white font-semibold py-3 shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

export const DiaryPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''

  const currentUser = useMemo(() => {
    const normalize = (value: any) => {
      if (value === null || value === undefined) return null
      const stringValue = String(value)
      if (stringValue === 'null' || stringValue === 'undefined' || stringValue.trim() === '') {
        return null
      }
      return stringValue
    }
    try {
      const parsed = JSON.parse(localStorage.getItem('current_user') || '{}')
      if (parsed && typeof parsed === 'object') {
        if ('organization_id' in parsed) {
          parsed.organization_id = normalize(parsed.organization_id)
        }
        if ('caregiver_id' in parsed) {
          parsed.caregiver_id = normalize(parsed.caregiver_id)
        }
      }
      return parsed
    } catch (error) {
      console.warn('Не удалось прочитать current_user', error)
      return {}
    }
  }, [])

  // Загружаем роль из user_profiles, если не найдена в metadata
  const [userRole, setUserRole] = useState<string | null>(
    currentUser.user_role || user?.user_metadata?.user_role || null
  )
  
  // Загружаем роль из user_profiles, если не определена
  useEffect(() => {
    const loadUserRole = async () => {
      if (!userRole && user?.id) {
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('user_id', user.id)
            .single()
          
          if (!error && data?.role) {
            console.log('[DiaryPage] Загружена роль из user_profiles:', data.role)
            setUserRole(data.role)
          } else if (error) {
            console.error('[DiaryPage] Ошибка загрузки роли из user_profiles:', error)
          }
        } catch (err) {
          console.error('Ошибка загрузки роли из user_profiles:', err)
        }
      }
    }
    
    loadUserRole()
  }, [user?.id, userRole])
  const organizationType =
    currentUser.organization_type || user?.user_metadata?.organization_type
  const isOrganization =
    organizationType === 'pension' || organizationType === 'patronage_agency'
  const isClient = userRole === 'client'
  const isCaregiver = organizationType === 'caregiver'
  const isOrgEmployee = userRole === 'org_employee'
  const isOrganizationAccount = isOrganization && !isOrgEmployee
  const userId =
    user?.id ||
    currentUser.id ||
    currentUser.user_id ||
    currentUser.user?.id ||
    currentUser.user_metadata?.user_id ||
    null
  const normalizeId = (value: any) => {
    if (value === null || value === undefined) return null
    const stringValue = String(value)
    if (stringValue === 'null' || stringValue === 'undefined' || stringValue.trim() === '') {
      return null
    }
    return stringValue
  }

  const userOrganizationId = normalizeId(
    currentUser.organization_id ||
      user?.user_metadata?.organization_id ||
      (user as any)?.organization_id
  )
  const userCaregiverId = normalizeId(
    currentUser.caregiver_id ||
      user?.user_metadata?.caregiver_id ||
      (user as any)?.caregiver_id
  )
  // Для организаций: если userOrganizationId не найден, пытаемся получить из таблицы organizations
  // Для сотрудников: получаем из organization_employees (будет загружено асинхронно)
  const effectiveOrganizationId = userOrganizationId || (isOrganizationAccount ? userId : null)

  const defaultHistoryDate = useMemo(() => toInputDate(new Date()), [])

  const [diary, setDiary] = useState<Diary | null>(null)
  const [patientCard, setPatientCard] = useState<PatientCard | null>(null)
  const [metrics, setMetrics] = useState<DiaryMetric[]>([])
  const [metricValues, setMetricValues] = useState<DiaryMetricValue[]>([])
  const [activeTab, setActiveTab] = useState<DiaryTab>('diary')
  const [selectedMetric, setSelectedMetric] = useState<{ type: string; label: string } | null>(null)
  const [isMetricModalOpen, setIsMetricModalOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [panelMetric, setPanelMetric] = useState<string | null>(null)
  const [panelVisible, setPanelVisible] = useState(false)
  const [isRoutePickerOpen, setIsRoutePickerOpen] = useState(false)
  const [selectedManipulations, setSelectedManipulations] = useState<string[]>([])

  const toggleManipulation = (key: string) => {
    setSelectedManipulations(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]))
  }
  const [careMetricOptionsState, setCareMetricOptions] = useState(() => CARE_METRIC_OPTIONS)
  const originalCareMetricValuesRef = useRef(new Set(CARE_METRIC_OPTIONS.map(o => o.value)))
  const [customMetricInput, setCustomMetricInput] = useState<string>('')
  
  const [physicalMetricOptionsState, setPhysicalMetricOptions] = useState(() => PHYSICAL_METRIC_OPTIONS)
  const originalPhysicalMetricValuesRef = useRef(new Set(PHYSICAL_METRIC_OPTIONS.map(o => o.value)))
  const [customPhysicalInput, setCustomPhysicalInput] = useState<string>('')

  const handleAddPhysicalMetric = () => {
    const label = customPhysicalInput.trim()
    if (!label) return
    const value = createValueFromLabel(label)
    setPhysicalMetricOptions(prev => {
      if (prev.some(o => o.value === value)) {
        const uniqueValue = `${value}_${Date.now().toString(36)}`
        return [...prev, { value: uniqueValue, label }]
      }
      return [...prev, { value, label }]
    })
    setSelectedManipulations(prev => (prev.includes(value) ? prev : [...prev, value]))
    setCustomPhysicalInput('')
  }

  const handlePhysicalInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddPhysicalMetric()
    }
  }

  const createValueFromLabel = (label: string) => {
    // create a readable slug, allow Cyrillic letters too
    let slug = label
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      // allow Latin a-z, digits, underscore and Cyrillic range
      .replace(/[^\w\u0400-\u04FF0-9_]/g, '')
      .slice(0, 60)
    if (!slug) {
      slug = `custom_${Date.now().toString(36)}`
    }
    return slug
  }

  const handleAddCustomMetric = () => {
    const label = customMetricInput.trim()
    if (!label) return
    const value = createValueFromLabel(label)
    // avoid duplicates by value
    setCareMetricOptions(prev => {
      if (prev.some(o => o.value === value)) {
        // already exists - append suffix to make unique
        const uniqueValue = `${value}_${Date.now().toString(36)}`
        return [...prev, { value: uniqueValue, label }]
      }
      return [...prev, { value, label }]
    })
    setSelectedManipulations(prev => (prev.includes(value) ? prev : [...prev, value]))
    setCustomMetricInput('')
  }

  const handleCustomInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddCustomMetric()
    }
  }

  const removeCareOption = (value: string) => {
    // don't remove original built-in options
    if (originalCareMetricValuesRef.current.has(value)) return
    setCareMetricOptions(prev => prev.filter(o => o.value !== value))
    setSelectedManipulations(prev => prev.filter(v => v !== value))
  }

  const removePhysicalOption = (value: string) => {
    if (originalPhysicalMetricValuesRef.current.has(value)) return
    setPhysicalMetricOptions(prev => prev.filter(o => o.value !== value))
    setSelectedManipulations(prev => prev.filter(v => v !== value))
  }
  // Route manipulation configuration modal state
  const [isRouteManipulationConfigOpen, setIsRouteManipulationConfigOpen] = useState(false)
  const [manipulationToConfigure, setManipulationToConfigure] = useState<string | string[] | null>(null)
  const [routeSchedules, setRouteSchedules] = useState<Record<string, { days: number[]; times: { from: string; to: string }[] }>>({})

  const handleSaveRouteManipulation = (metric: string, payload: { days: number[]; times: { from: string; to: string }[] }) => {
    setRouteSchedules(prev => {
      const next = { ...prev, [metric]: payload }
      try {
        localStorage.setItem('routeSchedules', JSON.stringify(next))
      } catch (e) {
        console.warn('[DiaryPage] Failed to persist routeSchedules to localStorage', e)
      }
      return next
    })
    console.log('[DiaryPage] route schedule saved:', metric, payload)
  }

  // Load persisted schedules from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('routeSchedules')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return
      const normalized: Record<string, { days: number[]; times: { from: string; to: string }[] }> = {}
      Object.entries(parsed).forEach(([k, v]: any) => {
        const days = Array.isArray(v.days) ? v.days.filter((d: any) => typeof d === 'number') : []
        const timesArr = Array.isArray(v.times) ? v.times : []
        const times = timesArr.map((t: any) => {
          if (!t) return { from: '07:00', to: '07:00' }
          if (typeof t === 'string') return { from: t, to: t }
          if (typeof t === 'object' && ('from' in t || 'to' in t)) return { from: t.from || '07:00', to: t.to || t.from || '07:00' }
          return { from: '07:00', to: '07:00' }
        })
        normalized[k] = { days, times }
      })
      setRouteSchedules(normalized)
      console.log('[DiaryPage] Loaded routeSchedules from localStorage', normalized)
    } catch (e) {
      console.warn('[DiaryPage] Failed to load routeSchedules from localStorage', e)
    }
  }, [])

  // Inline modal component for configuring a selected manipulation (days + times)
  const RouteManipulationModal = ({
    isOpen,
    metric,
    onClose,
    onSave,
  }: {
    isOpen: boolean
    metric: string | string[] | null
    onClose: () => void
    onSave: (metric: string, payload: { days: number[]; times: { from: string; to: string }[] }) => void
  }) => {
    const [daysState, setDaysState] = useState<boolean[]>([false, false, false, false, false, false, false])
    const [rangesState, setRangesState] = useState<Array<{ from: string; to: string }>>([])
    const [newFrom, setNewFrom] = useState('07:00')
    const [newTo, setNewTo] = useState('07:00')
    const [currentMetric, setCurrentMetric] = useState<string | null>(null)
    const [applyToAll, setApplyToAll] = useState(false)

    // When modal opens, set currentMetric to the first metric if array
    useEffect(() => {
      if (!isOpen || !metric) return
      if (Array.isArray(metric)) {
        setCurrentMetric(metric[0] || null)
      } else {
        setCurrentMetric(metric)
      }
      setApplyToAll(false)
    }, [isOpen, metric])

    // Prefill days/times when currentMetric changes
    useEffect(() => {
      if (!isOpen || !currentMetric) return
      const existing = routeSchedules[currentMetric] || { days: [], times: [] }
      const daysArr = [false, false, false, false, false, false, false]
      ;(existing.days || []).forEach((d: number) => {
        if (d >= 0 && d < 7) daysArr[d] = true
      })
      setDaysState(daysArr)
      // existing.times may be array of strings (old) or array of ranges
      const existingTimes = existing.times || []
      const normalized: Array<{ from: string; to: string }> = (existingTimes as any).map((t: any) => {
        if (!t) return { from: '07:00', to: '07:00' }
        if (typeof t === 'string') return { from: t, to: t }
        if (typeof t === 'object' && 'from' in t && 'to' in t) return { from: t.from || '07:00', to: t.to || t.from || '07:00' }
        return { from: '07:00', to: '07:00' }
      })
      setRangesState(normalized)
      setNewFrom('07:00')
      setNewTo('07:00')
    }, [isOpen, currentMetric])

    if (!isOpen || !metric) return null

    const toggleDay = (idx: number) => {
      setDaysState(prev => {
        const copy = [...prev]
        copy[idx] = !copy[idx]
        return copy
      })
    }

    const addRange = () => {
      if (!newFrom || !newTo) return
      // avoid duplicate exact ranges
      const exists = rangesState.some(r => r.from === newFrom && r.to === newTo)
      if (!exists) setRangesState(prev => [...prev, { from: newFrom, to: newTo }])
      setNewFrom('07:00')
      setNewTo('07:00')
    }

    const removeRange = (r: { from: string; to: string }) =>
      setRangesState(prev => prev.filter(x => !(x.from === r.from && x.to === r.to)))

    const doSave = () => {
      const selectedDays = daysState.map((v, i) => (v ? i : -1)).filter(i => i !== -1)
      const payload = { days: selectedDays, times: rangesState }
      if (Array.isArray(metric) && applyToAll) {
        // Apply to all selected metrics
        metric.forEach(m => onSave(m, payload))
      } else if (Array.isArray(metric) && currentMetric) {
        onSave(currentMetric, payload)
      } else if (typeof metric === 'string') {
        onSave(metric, payload)
      }
      onClose()
    }

    const dayLabels = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']

    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm rounded-[28px] bg-white p-6 space-y-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-[#25ADB8]">Настройте манипуляцию</h2>
            <div className="text-xl font-semibold mt-1">
              {Array.isArray(metric) ? (
                <div className="flex flex-wrap gap-2 justify-center">
                  {(metric as string[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCurrentMetric(m)}
                      className={`px-3 py-2 rounded-2xl text-sm font-semibold ${currentMetric === m ? 'bg-[#CFF6F8] text-[#0A6D83] shadow-md' : 'bg-white border border-gray-200 text-[#4A4A4A]'}`}
                    >
                      {getMetricLabel(m)}
                    </button>
                  ))}
                </div>
              ) : (
                getMetricLabel(metric as string)
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap gap-2 justify-center">
              {dayLabels.map((lbl, i) => (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-3 py-2 rounded-2xl text-sm font-semibold ${daysState[i] ? 'bg-[#CFF6F8] text-[#0A6D83] shadow-md' : 'bg-white border border-gray-200 text-[#4A4A4A]'}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              {rangesState.map(r => (
                <div key={`${r.from}_${r.to}`} className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2">
                  <span className="text-sm font-medium">{r.from}{r.from !== r.to ? ` — ${r.to}` : ''}</span>
                  <button onClick={() => removeRange(r)} className="text-xs text-red-500">×</button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={newFrom}
                onChange={e => setNewFrom(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2"
              />
              <span className="text-gray-400">—</span>
              <input
                type="time"
                value={newTo}
                onChange={e => setNewTo(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2"
              />
              <button onClick={addRange} className="w-12 h-12 rounded-xl bg-[#2AA6B1] text-white">+</button>
            </div>
          </div>
        {Array.isArray(metric) && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} />
              <span>Применить ко всем выбранным</span>
            </label>
          </div>
        )}

          <div className="flex items-center gap-3 justify-center pt-2">
            <button onClick={doSave} className="px-6 py-3 rounded-2xl bg-[#55ACBF] text-white font-semibold">Сохранить</button>
            <button onClick={onClose} className="px-6 py-3 rounded-2xl bg-gray-200 text-[#4A4A4A] font-semibold">Отмена</button>
          </div>
        </div>
      </div>
    )
  }
  const [caregiverOrganizationId, setCaregiverOrganizationId] = useState<string | null>(null)
  const [animatingPinnedMetric, setAnimatingPinnedMetric] = useState<{ type: string; index: number; direction: 'toPanel' | 'fromPanel' } | null>(null)
  const [panelOriginIndex, setPanelOriginIndex] = useState<number | null>(null)
  const [metricSettings, setMetricSettings] = useState<Record<string, MetricSettings>>({})
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date())
  const panelTimerRef = useRef<number | null>(null)
  const panelAnimationFrameRef = useRef<number | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(defaultHistoryDate)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => fromInputDate(defaultHistoryDate))
  const calendarRef = useRef<HTMLDivElement | null>(null)
  const [organizationClientLink, setOrganizationClientLink] = useState<DiaryClientLink | null>(null)
  const [attachedClient, setAttachedClient] = useState<ClientProfile | null>(null)
  const [externalAccessLinks, setExternalAccessLinks] = useState<Array<{ 
    id: string
    token: string
    link?: string
    invited_email?: string | null
    invited_phone?: string | null
    expires_at?: string | null
    created_at: string
  }>>([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<'card' | 'metrics' | 'access'>('card')
  const windowWidth = useWindowWidth()
  const isSmallScreen = windowWidth < 388

  const getMetricLabel = (metricType: string): string => {
    // Проверяем, является ли это пользовательским показателем
    // Если да, пытаемся получить label из metadata метрики
    if (metricType.startsWith('custom_')) {
      const metric = metrics.find(m => m.metric_type === metricType)
      if (metric) {
        const metadata = (metric as any).metadata || {}
        if (metadata.label) {
          return metadata.label
        }
        // Если label не найден в metadata, извлекаем из metricType
        const label = metricType
          .replace('custom_care_', '')
          .replace('custom_physical_', '')
          .replace('custom_excretion_', '')
          .replace('custom_symptom_', '')
        return label || metricType
      }
      // Fallback: извлекаем label из metricType
      const label = metricType
        .replace('custom_care_', '')
        .replace('custom_physical_', '')
        .replace('custom_excretion_', '')
        .replace('custom_symptom_', '')
      return label || metricType
    }

    const labels: Record<string, string> = {
      // Уход
      walk: 'Прогулка',
      cognitive_games: 'Когнитивные игры',
      diaper_change: 'Смена подгузников',
      hygiene: 'Гигиена',
      skin_moisturizing: 'Увлажнение кожи',
      meal: 'Прием пищи',
      medications: 'Прием лекарств',
      vitamins: 'Прием витаминов',
      sleep: 'Сон',
      // Физические
      temperature: 'Температура',
      blood_pressure: 'Давление',
  pulse: 'Пульс',
      breathing_rate: 'Частота дыхания',
      pain_level: 'Уровень боли',
      saturation: 'Сатурация',
      blood_sugar: 'Уровень сахара в крови',
      // Выделение
      urination: 'Выпито/выделено и цвет мочи',
      defecation: 'Дефекация',
      // Симптомы
      nausea: 'Тошнота',
      vomiting: 'Рвота',
      shortness_of_breath: 'Одышка',
      itching: 'Зуд',
      cough: 'Кашель',
      dry_mouth: 'Сухость во рту',
      hiccups: 'Икота',
      taste_disturbance: 'Нарушение вкуса',
    }
    return labels[metricType] || metricType
  }

  // const scheduledItemsForDate = useMemo<
  //   Array<{ metric: string; label: string; from: string; to: string; startMinutes: number }>
  // >(() => {
  //   if (!selectedDate) return []
  //   const date = fromInputDate(selectedDate)
  //   const jsDay = date.getDay()
  //   const dayIndex = (jsDay + 6) % 7

  //   const items: Array<{ metric: string; label: string; from: string; to: string; startMinutes: number }> = []
  //   Object.entries(routeSchedules || {}).forEach(([metric, sched]) => {
  //     if (!sched || !Array.isArray((sched as any).days)) return
  //     if (!((sched as any).days as number[]).includes(dayIndex)) return
  //     const times = Array.isArray((sched as any).times) ? (sched as any).times : []
  //     times.forEach((r: any) => {
  //       const from = (r && r.from) || r || '07:00'
  //       const to = (r && r.to) || r || from
  //       const startMinutes = timeStringToMinutes(from)
  //       items.push({ metric, label: getMetricLabel(metric), from, to, startMinutes })
  //     })
  //   })
  //   items.sort((a, b) => a.startMinutes - b.startMinutes)
  //   return items
  // }, [routeSchedules, selectedDate, metrics])
  const assignmentOrganizationType = useMemo(
    () =>
      organizationType ||
      diary?.organization_type ||
      currentUser.organization_type ||
      null,
    [organizationType, diary?.organization_type, currentUser.organization_type]
  )

  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [cardDraft, setCardDraft] = useState({
    fullName: '',
    dateOfBirth: '',
    address: '',
    diagnoses: '',
    mobility: 'walks' as 'walks' | 'sits' | 'lies',
  })
  const [metricsDraftSelected, setMetricsDraftSelected] = useState<string[]>([])
  const [metricsDraftPinned, setMetricsDraftPinned] = useState<string[]>([])
  const [isSavingCard, setIsSavingCard] = useState(false)
  const [isSavingMetrics, setIsSavingMetrics] = useState(false)
  const [availableOrgEmployees, setAvailableOrgEmployees] = useState<
    Array<{ user_id: string; first_name?: string; last_name?: string; role?: string; organization_type?: OrganizationType | null }>
  >([])
  const [invitedClients, setInvitedClients] = useState<
    Array<{
      invite_id: string
      token: string
      client_id: string | null
      invited_client_phone: string | null
      invited_client_name: string | null
      used_at: string | null
      used_by: string | null
      accepted_at: string | null
      accepted_by: string | null
      created_at: string
      registered_client_name?: string
      registered_client_phone?: string
      registered_client_user_id?: string
    }>
  >([])
  const [organizationInfo, setOrganizationInfo] = useState<{ id: string; name: string; type: string | null } | null>(null)
  const [assignedEmployees, setAssignedEmployees] = useState<
    Array<{ user_id: string; first_name?: string; last_name?: string; role?: string; organization_type?: OrganizationType | null; revoked_at?: string | null }>
  >([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false)
  const updateAttachedClientInfo = async (link: DiaryClientLink | null) => {
    if (!link?.accepted_by) {
      setAttachedClient(null)
      return
    }
    
    // Загружаем клиента из Supabase
    try {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', link.accepted_by)
        .maybeSingle()

      if (clientError) {
        console.warn('Ошибка загрузки клиента:', clientError)
        setAttachedClient(null)
      } else if (clientData) {
        setAttachedClient({
          user_id: clientData.user_id,
          first_name: clientData.first_name || '',
          last_name: clientData.last_name || '',
        })
      } else {
        setAttachedClient(null)
      }
    } catch (error) {
      console.warn('Не удалось загрузить данные клиента', error)
      setAttachedClient(null)
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  // Загрузка ID организации-сиделки из таблицы organizations
  useEffect(() => {
    if (!isCaregiver || !userId) return

    const loadCaregiverOrganizationId = async () => {
      try {
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .eq('organization_type', 'caregiver')
          .maybeSingle()

        if (!orgError && orgData) {
          console.log('[DiaryPage] Загружен ID организации-сиделки:', orgData.id)
          setCaregiverOrganizationId(orgData.id)
        } else if (orgError) {
          console.error('[DiaryPage] Ошибка загрузки ID организации-сиделки:', orgError)
        }
      } catch (error) {
        console.error('[DiaryPage] Ошибка загрузки ID организации-сиделки:', error)
      }
    }

    loadCaregiverOrganizationId()
  }, [isCaregiver, userId])

  // ВАЖНО: Для сиделки используем caregiverOrganizationId (id из organizations), а не userId
  // Определяем здесь, чтобы использовать в accessState useMemo ниже
  const effectiveCaregiverId = useMemo(() => {
    return userCaregiverId || (isCaregiver ? caregiverOrganizationId : null)
  }, [userCaregiverId, isCaregiver, caregiverOrganizationId])

  // Загружаем organization_id для сотрудников из organization_employees
  const [employeeOrganizationId, setEmployeeOrganizationId] = useState<string | null>(null)
  // Загружаем organization_id для организаций из таблицы organizations
  const [loadedOrganizationId, setLoadedOrganizationId] = useState<string | null>(null)
  
  useEffect(() => {
    if (!userId) {
      setEmployeeOrganizationId(null)
      setLoadedOrganizationId(null)
      return
    }

    const loadOrgIds = async () => {
      // Для сотрудников загружаем organization_id из organization_employees
      if (isOrgEmployee) {
        try {
          const { data: employeeData, error: employeeError } = await supabase
            .from('organization_employees')
            .select('organization_id')
            .eq('user_id', userId)
            .maybeSingle()
          
          if (!employeeError && employeeData?.organization_id) {
            setEmployeeOrganizationId(employeeData.organization_id)
            console.log('[DiaryPage] Loaded employee organization_id:', employeeData.organization_id)
          }
        } catch (error) {
          console.error('[DiaryPage] Error loading employee organization_id:', error)
        }
      }
      
      // Для организаций загружаем organization_id из organizations, если его нет в metadata
      if (isOrganizationAccount && !userOrganizationId) {
        try {
          const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle()
          
          if (!orgError && orgData?.id) {
            setLoadedOrganizationId(orgData.id)
            console.log('[DiaryPage] Loaded organization_id from organizations table:', orgData.id)
          }
        } catch (error) {
          console.error('[DiaryPage] Error loading organization_id:', error)
        }
      }
    }

    loadOrgIds()
  }, [isOrgEmployee, isOrganizationAccount, userId, userOrganizationId])

  // Обновляем effectiveOrganizationId с учетом загруженного organization_id для сотрудников и организаций
  const finalEffectiveOrganizationId = useMemo(() => {
    if (isOrgEmployee && employeeOrganizationId) {
      return employeeOrganizationId
    }
    if (isOrganizationAccount && loadedOrganizationId) {
      return loadedOrganizationId
    }
    return effectiveOrganizationId
  }, [isOrgEmployee, isOrganizationAccount, employeeOrganizationId, loadedOrganizationId, effectiveOrganizationId])

  // Загрузка ссылок для клиентов из Supabase
  useEffect(() => {
    if (!id) return

    const loadClientLinks = async () => {
      try {
        // Загружаем ссылку для клиента из таблицы diary_client_links
        const { data: clientLink, error: linkError } = await supabase
          .from('diary_client_links')
          .select('*')
          .eq('diary_id', id)
          .maybeSingle()

        if (linkError) {
          console.error('Ошибка загрузки ссылки для клиента:', linkError)
          setOrganizationClientLink(null)
          setAttachedClient(null)
          return
        }

        if (clientLink) {
          // Преобразуем данные из БД в формат DiaryClientLink
          const link = clientLink.token 
            ? `${appOrigin}/client-invite?diary=${id}&token=${clientLink.token}`
            : ''
          const normalized: DiaryClientLink = {
            link,
            created_at: clientLink.accepted_at || new Date().toISOString(),
            token: clientLink.token || '',
            diary_id: clientLink.diary_id,
            patient_card_id: diary?.patient_card_id ?? null,
            organization_id: diary?.organization_id ?? effectiveOrganizationId ?? null,
            accepted_by: clientLink.accepted_by || null,
            accepted_at: clientLink.accepted_at || null,
            client_id: clientLink.client_id || null,
          }

            setOrganizationClientLink(normalized)
            updateAttachedClientInfo(normalized)
          } else {
            setOrganizationClientLink(null)
            setAttachedClient(null)
          }
      } catch (error) {
        console.error('Ошибка загрузки ссылки для клиента:', error)
          setOrganizationClientLink(null)
          setAttachedClient(null)
        }
    }

    loadClientLinks()
  }, [id, diary?.patient_card_id, diary?.organization_id, effectiveOrganizationId, finalEffectiveOrganizationId, employeeOrganizationId, isOrgEmployee])

  // Загрузка приглашенных клиентов
  useEffect(() => {
    console.log('[DiaryPage] useEffect для загрузки клиентов:', { id, isOrganization, organizationType, userRole })
    // Загружаем для всех организаций (не только для аккаунтов организаций, но и для сотрудников, которые могут видеть вкладку)
    if (!id) {
      console.log('[DiaryPage] Пропуск загрузки клиентов: нет id')
      return
    }
    // Загружаем для организаций и руководителей с правами на управление клиентами
    // Проверяем права внутри функции loadInvitedClients, так как employeePermissions может быть еще не загружен
    if (!isOrganization && !isOrgEmployee) {
      console.log('[DiaryPage] Пропуск загрузки клиентов: не организация и не сотрудник', { isOrganization, isOrgEmployee, organizationType })
      return
    }

    const loadInvitedClients = async () => {
      try {
        // Для руководителей проверяем права на управление клиентами
        if (isOrgEmployee && !employeePermissions.canManageClientAccess) {
          console.log('[DiaryPage] Пропуск загрузки клиентов: руководитель без прав на управление клиентами')
          setInvitedClients([])
          return
        }
        
        // Определяем organization_id для загрузки клиентов
        // Для руководителей используем employeeOrganizationId или finalEffectiveOrganizationId
        const orgIdForLoading = isOrgEmployee 
          ? (employeeOrganizationId || finalEffectiveOrganizationId || diary?.organization_id)
          : (diary?.organization_id || effectiveOrganizationId)
        
        console.log('[DiaryPage] Загрузка приглашенных клиентов для дневника:', id, 'organization_id:', orgIdForLoading)
        
        // Сначала загружаем diary_client_links напрямую - это основной источник данных
        const { data: clientLinks, error: linksError } = await supabase
          .from('diary_client_links')
          .select('token, accepted_at, client_id, accepted_by')
          .eq('diary_id', id)

        console.log('[DiaryPage] Загружено diary_client_links:', clientLinks?.length || 0, 'Ошибка:', linksError)

        // Загружаем приглашения клиентов для этого дневника
        // ВАЖНО: загружаем used_by для определения зарегистрированных клиентов
        const { data: inviteTokens, error: inviteError } = await supabase
          .from('invite_tokens')
          .select(`
            id,
            token,
            used_at,
            used_by,
            revoked_at,
            created_at,
            organization_client_invite_tokens (
              invite_id,
              diary_id,
              organization_id,
              invited_client_phone,
              invited_client_name,
              metadata
            )
          `)
          .eq('invite_type', 'organization_client')
          .order('created_at', { ascending: false })
        
        console.log('[DiaryPage] Загружено приглашений:', inviteTokens?.length || 0, 'Ошибка:', inviteError)
        if (inviteTokens && inviteTokens.length > 0) {
          console.log('[DiaryPage] Детали загруженных приглашений:', inviteTokens.map((it: any) => ({
            token: it.token,
            used_at: it.used_at,
            used_by: it.used_by,
            invite_type: it.invite_type,
          })))
        }

        // Не прерываем выполнение, если есть ошибка загрузки invite_tokens
        // Основной источник данных - diary_client_links

        // УДАЛЕНО: Старая логика фильтрации filteredInvites больше не используется
        // Теперь используем inviteTokensMap напрямую

        // Создаем карту токенов из diary_client_links для быстрого поиска
        const linksMap = new Map<string, { accepted_at: string | null; client_id: string | null; accepted_by: string | null }>()
        if (!linksError && clientLinks && clientLinks.length > 0) {
          clientLinks.forEach((link: any) => {
            linksMap.set(link.token, {
              accepted_at: link.accepted_at,
              client_id: link.client_id,
              accepted_by: link.accepted_by,
            })
            console.log('[DiaryPage] Добавлена ссылка в карту:', {
              token: link.token,
              client_id: link.client_id,
              accepted_at: link.accepted_at,
              accepted_by: link.accepted_by,
            })
          })
          console.log('[DiaryPage] Создана карта токенов из diary_client_links:', linksMap.size)
        }

        // Объявляем clientsData заранее, чтобы данные восстановленных клиентов сохранялись
        let clientsData: Record<string, { first_name?: string; last_name?: string; user_id?: string; phone?: string }> = {}
        
        // Создаем карту invite_tokens по токену для быстрого поиска
        const inviteTokensMap = new Map<string, any>()
        const usedByUserIds = new Set<string>() // Собираем user_id из used_by для восстановления данных
        if (!inviteError && inviteTokens && inviteTokens.length > 0) {
          inviteTokens.forEach((invite: any) => {
            const clientInviteData = Array.isArray(invite.organization_client_invite_tokens)
              ? invite.organization_client_invite_tokens.find((ci: any) => ci.diary_id === id)
              : invite.organization_client_invite_tokens?.diary_id === id
              ? invite.organization_client_invite_tokens
              : null
            
            if (clientInviteData) {
              // ВАЖНО: Если приглашение связано с текущим дневником (diary_id совпадает),
              // то показываем его независимо от organization_id
              // Это нужно, потому что дневник может быть создан одной организацией,
              // а приглашение - другой (или сотрудником)
              const isForCurrentDiary = clientInviteData.diary_id === id
              
              // Проверяем organization_id только если приглашение НЕ для текущего дневника
              // ИЛИ если organization_id совпадает
              // Используем правильный organization_id для руководителей
              const orgIdForCheck = isOrgEmployee 
                ? (employeeOrganizationId || finalEffectiveOrganizationId || diary?.organization_id || effectiveOrganizationId)
                : (diary?.organization_id || effectiveOrganizationId)
              
              const orgMatches = !orgIdForCheck || 
                !clientInviteData.organization_id || 
                clientInviteData.organization_id === orgIdForCheck
              
              if (isForCurrentDiary || orgMatches) {
                inviteTokensMap.set(invite.token, {
                  invite_id: invite.id,
                  used_at: invite.used_at,
                  used_by: invite.used_by, // Добавляем used_by для восстановления данных
                  created_at: invite.created_at,
                  invited_client_phone: clientInviteData.invited_client_phone,
                  invited_client_name: clientInviteData.invited_client_name,
                  organization_id: clientInviteData.organization_id,
                })
                
                // Если приглашение использовано, собираем user_id для восстановления данных
                if (invite.used_at && invite.used_by) {
                  usedByUserIds.add(invite.used_by)
                  console.log('[DiaryPage] ✅ Найдено использованное приглашение:', {
                    token: invite.token,
                    used_at: invite.used_at,
                    used_by: invite.used_by,
                    invite_id: invite.id,
                    diary_id: clientInviteData.diary_id,
                    isForCurrentDiary,
                  })
    } else {
                  console.log('[DiaryPage] ⚠️ Приглашение не использовано или нет used_by:', {
                    token: invite.token,
                    used_at: invite.used_at,
                    used_by: invite.used_by,
                    invite_id: invite.id,
                    diary_id: clientInviteData.diary_id,
                    isForCurrentDiary,
                  })
                }
              } else {
                console.log('[DiaryPage] Пропуск приглашения: organization_id не совпадает и не для текущего дневника', {
                  invite_id: invite.id,
                  invite_org_id: clientInviteData.organization_id,
                  current_org_id: effectiveOrganizationId,
                  diary_id: clientInviteData.diary_id,
                  current_diary_id: id,
                })
              }
            }
          })
        }
        
        // ВАЖНО: Проверяем, есть ли использованные приглашения, даже если used_by не загружен
        // Это может быть из-за RLS политик, поэтому проверяем через used_at
        const usedInviteTokens = Array.from(inviteTokensMap.entries())
          .filter(([, data]) => data.used_at && !data.used_by)
        
        if (usedInviteTokens.length > 0) {
          console.log('[DiaryPage] ⚠️ Найдены использованные приглашения без used_by (возможно, RLS блокирует):', usedInviteTokens.length)
          console.log('[DiaryPage] Детали приглашений без used_by:', usedInviteTokens.map(([token, data]) => ({ token, used_at: data.used_at })))
          // Пытаемся найти клиентов по другим признакам (например, по token в diary_client_links)
        }
        
        // Восстанавливаем данные из invite_tokens, если diary_client_links не обновлен
        // Если приглашение использовано (used_at не null), но diary_client_links не обновлен,
        // загружаем клиента по used_by и обновляем linksMap
        if (usedByUserIds.size > 0) {
          console.log('[DiaryPage] Восстанавливаем данные для использованных приглашений, used_by:', Array.from(usedByUserIds))
          
          // Загружаем клиентов по used_by (user_id)
          const { data: registeredClients, error: registeredClientsError } = await supabase
            .from('clients')
            .select('id, user_id, first_name, last_name, phone, invited_by_organization_id')
            .in('user_id', Array.from(usedByUserIds))
          
          console.log('[DiaryPage] Загружено зарегистрированных клиентов по used_by:', registeredClients?.length || 0, 'Ошибка:', registeredClientsError)
          
          if (!registeredClientsError && registeredClients && registeredClients.length > 0) {
            // Создаем карту user_id -> client_id
            const userIdToClientMap = new Map(registeredClients.map((c: any) => [c.user_id, c]))
            
            // Обновляем linksMap и inviteTokensMap с найденными данными
            inviteTokensMap.forEach((inviteData, token) => {
              if (inviteData.used_by && inviteData.used_at) {
                const clientData = userIdToClientMap.get(inviteData.used_by)
                if (clientData) {
                  // Проверяем, что клиент действительно был приглашен этой организацией
                  // Используем правильный organization_id для руководителей
                  const orgIdForCheck = isOrgEmployee 
                    ? (employeeOrganizationId || finalEffectiveOrganizationId || diary?.organization_id || effectiveOrganizationId)
                    : (diary?.organization_id || effectiveOrganizationId)
                  
                  const orgIdMatches = !orgIdForCheck || 
                    !inviteData.organization_id || 
                    inviteData.organization_id === orgIdForCheck ||
                    clientData.invited_by_organization_id === orgIdForCheck
                  
                  if (orgIdMatches) {
                    // Обновляем linksMap, если запись существует, или создаем новую
                    const existingLink = linksMap.get(token)
                    if (existingLink) {
                      // Обновляем существующую запись
                      existingLink.client_id = clientData.id
                      existingLink.accepted_by = inviteData.used_by
                      existingLink.accepted_at = inviteData.used_at
                      console.log('[DiaryPage] Восстановлены данные для существующей записи:', {
                        token,
                        client_id: clientData.id,
                        accepted_by: inviteData.used_by,
                        accepted_at: inviteData.used_at,
                      })
                    } else {
                      // Создаем новую запись в linksMap
                      linksMap.set(token, {
                        client_id: clientData.id,
                        accepted_by: inviteData.used_by,
                        accepted_at: inviteData.used_at,
                      })
                      console.log('[DiaryPage] Создана новая запись в linksMap для токена:', token)
                    }
                  }
                }
              }
            })
            
            // Добавляем данные восстановленных клиентов в clientsData для последующего использования
            // Это будет использовано при формировании finalClientsList
            registeredClients.forEach((client: any) => {
              if (!clientsData[client.id]) {
                clientsData[client.id] = {
                  first_name: client.first_name || undefined,
                  last_name: client.last_name || undefined,
                  user_id: client.user_id || undefined,
                  phone: client.phone || undefined,
                }
                console.log('[DiaryPage] Добавлены данные восстановленного клиента в clientsData:', client.id)
              }
            })
          }
        }
        
        // Если есть данные из diary_client_links или invite_tokens, обрабатываем их
        if (linksMap.size > 0 || inviteTokensMap.size > 0) {

          // Загружаем информацию о клиентах, которые зарегистрировались
          // Собираем все client_id и accepted_by из linksMap
          const allClientIds = new Set<string>()
          const allAcceptedByUserIds = new Set<string>()
          
          linksMap.forEach((linkData) => {
            if (linkData.client_id) {
              allClientIds.add(linkData.client_id)
            }
            if (linkData.accepted_by) {
              allAcceptedByUserIds.add(linkData.accepted_by)
            }
          })
          
          // Также собираем used_by из invite_tokens для зарегистрированных клиентов
          inviteTokensMap.forEach((inviteData) => {
            if (inviteData.used_by && inviteData.used_at) {
              allAcceptedByUserIds.add(inviteData.used_by)
            }
          })
          
          console.log('[DiaryPage] ID зарегистрированных клиентов из client_id:', Array.from(allClientIds))
          console.log('[DiaryPage] User ID из accepted_by и used_by:', Array.from(allAcceptedByUserIds))
          
          // Объявляем clientsData заранее
          let clientsData: Record<string, { first_name?: string; last_name?: string; user_id?: string; phone?: string }> = {}
          
          // Если есть accepted_by, но нет client_id, загружаем клиентов по user_id
          if (allAcceptedByUserIds.size > 0) {
            const acceptedByUserIdsArray = Array.from(allAcceptedByUserIds)
            console.log('[DiaryPage] Загружаем клиентов по accepted_by (user_id)')
            const { data: clientsByUserId, error: clientsByUserIdError } = await supabase
              .from('clients')
              .select('id, user_id, first_name, last_name, phone')
              .in('user_id', acceptedByUserIdsArray)
            
            console.log('[DiaryPage] Загружено клиентов по user_id:', clientsByUserId?.length || 0, 'Ошибка:', clientsByUserIdError)
            
            if (!clientsByUserIdError && clientsByUserId && clientsByUserId.length > 0) {
              // Обновляем linksMap с найденными client_id
              const userIdToClientId = new Map(clientsByUserId.map((c: any) => [c.user_id, c.id]))
              linksMap.forEach((linkData, token) => {
                if (!linkData.client_id && linkData.accepted_by) {
                  const foundClientId = userIdToClientId.get(linkData.accepted_by)
                  if (foundClientId) {
                    linkData.client_id = foundClientId
                    allClientIds.add(foundClientId)
                    console.log('[DiaryPage] Найден client_id для токена:', token, 'client_id:', foundClientId)
                  }
                }
              })
              
              // Добавляем данные клиентов в clientsData
              clientsByUserId.forEach((client: any) => {
                clientsData[client.id] = {
                  first_name: client.first_name || undefined,
                  last_name: client.last_name || undefined,
                  user_id: client.user_id || undefined,
                  phone: client.phone || undefined,
                }
              })
            }
          }
          
          // Загружаем клиентов по client_id
          if (allClientIds.size > 0) {
            const clientIdsArray = Array.from(allClientIds)
            const { data: clients, error: clientsError } = await supabase
              .from('clients')
              .select('id, first_name, last_name, user_id, phone')
              .in('id', clientIdsArray)

            console.log('[DiaryPage] Загружено клиентов из БД:', clients?.length || 0, 'Ошибка:', clientsError)

            if (!clientsError && clients && clients.length > 0) {
              clients.forEach((client: any) => {
                clientsData[client.id] = {
                  first_name: client.first_name || undefined,
                  last_name: client.last_name || undefined,
                  user_id: client.user_id || undefined,
                  phone: client.phone || undefined,
                }
              })
            }
          }

          // Объединяем данные из diary_client_links и invite_tokens
          // Приоритет: diary_client_links (основной источник истины)
          const finalClientsList: Array<{
            invite_id: string
            token: string
            client_id: string | null
            invited_client_phone: string | null
            invited_client_name: string | null
            used_at: string | null
            used_by: string | null
            accepted_at: string | null
            accepted_by: string | null
            created_at: string
            registered_client_name?: string
            registered_client_phone?: string
            registered_client_user_id?: string
          }> = []

          // Обрабатываем все записи из diary_client_links (основной источник)
          linksMap.forEach((linkData, token) => {
            const inviteTokenData = inviteTokensMap.get(token)
            // Используем client_id из linksMap (может быть восстановлен из invite_tokens)
            const clientId = linkData.client_id
            // Если client_id есть, загружаем данные клиента
            let clientInfo = clientId ? clientsData[clientId] : null
            
            // Если client_id нет, но есть used_by в invite_tokens, пытаемся найти клиента
            if (!clientId && inviteTokenData?.used_by) {
              // Ищем клиента по used_by в уже загруженных данных
              const foundClient = Object.values(clientsData).find(c => c.user_id === inviteTokenData.used_by)
              if (foundClient) {
                // Находим client_id по user_id
                const foundClientId = Object.keys(clientsData).find(id => clientsData[id].user_id === inviteTokenData.used_by)
                if (foundClientId) {
                  clientInfo = clientsData[foundClientId]
                  // Обновляем linkData для последующего использования
                  linkData.client_id = foundClientId
                }
              }
            }
            
            // Определяем accepted_at: приоритет у linksMap, но если null, используем used_at из invite_tokens
            const acceptedAt = linkData.accepted_at || inviteTokenData?.used_at || null
            // Определяем accepted_by: приоритет у linksMap, но если null, используем used_by из invite_tokens
            const acceptedBy = linkData.accepted_by || inviteTokenData?.used_by || null

            finalClientsList.push({
              invite_id: inviteTokenData?.invite_id || `link_${token}`,
              token: token,
              client_id: clientId || (acceptedBy ? Object.keys(clientsData).find(id => clientsData[id].user_id === acceptedBy) || null : null),
              invited_client_phone: inviteTokenData?.invited_client_phone || clientInfo?.phone || null,
              invited_client_name: inviteTokenData?.invited_client_name || (clientInfo
                ? `${clientInfo.first_name || ''} ${clientInfo.last_name || ''}`.trim() || null
                : null),
              used_at: inviteTokenData?.used_at || null,
              used_by: inviteTokenData?.used_by || null,
              accepted_at: acceptedAt,
              accepted_by: acceptedBy,
              created_at: inviteTokenData?.created_at || acceptedAt || new Date().toISOString(),
              registered_client_name: clientInfo
                ? `${clientInfo.first_name || ''} ${clientInfo.last_name || ''}`.trim() || undefined
                : undefined,
              registered_client_phone: clientInfo?.phone || undefined,
              registered_client_user_id: clientInfo?.user_id || undefined,
            })
          })

          // Добавляем приглашения из invite_tokens, которых нет в diary_client_links
          inviteTokensMap.forEach((inviteData, token) => {
            if (!linksMap.has(token)) {
              // Если приглашение использовано, пытаемся найти клиента
              let clientInfo: { first_name?: string; last_name?: string; user_id?: string; phone?: string } | null = null
              let clientId: string | null = null
              
              if (inviteData.used_by && inviteData.used_at) {
                // Ищем клиента по used_by в уже загруженных данных
                const foundClient = Object.values(clientsData).find(c => c.user_id === inviteData.used_by)
                if (foundClient) {
                  clientId = Object.keys(clientsData).find(id => clientsData[id].user_id === inviteData.used_by) || null
                  clientInfo = foundClient
                }
              }
              
              finalClientsList.push({
                invite_id: inviteData.invite_id,
                token: token,
                client_id: clientId,
                invited_client_phone: inviteData.invited_client_phone || clientInfo?.phone || null,
                invited_client_name: inviteData.invited_client_name || (clientInfo
                  ? `${clientInfo.first_name || ''} ${clientInfo.last_name || ''}`.trim() || null
                  : null),
                used_at: inviteData.used_at || null,
                used_by: inviteData.used_by || null,
                accepted_at: inviteData.used_at || null, // Если приглашение использовано, считаем его принятым
                accepted_by: inviteData.used_by || null,
                created_at: inviteData.created_at,
                registered_client_name: clientInfo
                  ? `${clientInfo.first_name || ''} ${clientInfo.last_name || ''}`.trim() || undefined
                  : undefined,
                registered_client_phone: clientInfo?.phone || undefined,
                registered_client_user_id: clientInfo?.user_id || undefined,
              })
            }
          })

          console.log('[DiaryPage] Итоговый список клиентов:', finalClientsList.length)
          setInvitedClients(finalClientsList)
        } else {
          // Если нет данных ни из diary_client_links, ни из invite_tokens
          console.log('[DiaryPage] Нет данных о клиентах')
          setInvitedClients([])
        }
      } catch (error) {
        console.error('Ошибка загрузки приглашенных клиентов:', error)
        setInvitedClients([])
      }
    }

    loadInvitedClients()
  }, [id, isOrganization, isOrgEmployee, effectiveOrganizationId, finalEffectiveOrganizationId, employeeOrganizationId, diary?.organization_id, organizationClientLink?.accepted_by]) // Перезагружаем при изменении статуса клиента

  // Загрузка внешних ссылок из Supabase
  useEffect(() => {
    if (!id) return

    const loadExternalLinks = async () => {
      try {
        // Загружаем внешние ссылки из таблицы diary_external_access_links
        const { data: externalLinks, error: linksError } = await supabase
          .from('diary_external_access_links')
          .select('*')
          .eq('diary_id', id)
          .is('revoked_at', null) // Только активные ссылки
          .order('created_at', { ascending: false })

        if (linksError) {
          console.error('Ошибка загрузки внешних ссылок:', linksError)
          setExternalAccessLinks([])
          return
        }

        if (externalLinks && externalLinks.length > 0) {
          // Преобразуем данные из БД в формат для компонента
          const formattedLinks = externalLinks.map(link => ({
            id: link.id,
            token: link.link_token,
            link: `${appOrigin}/diaries/${id}?access=${link.link_token}`,
            invited_email: link.invited_email || null,
            invited_phone: link.invited_phone || null,
            expires_at: link.expires_at || null,
            created_at: link.created_at,
          }))
          setExternalAccessLinks(formattedLinks)
        } else {
          setExternalAccessLinks([])
        }
      } catch (error) {
        console.error('Ошибка загрузки внешних ссылок:', error)
        setExternalAccessLinks([])
      }
    }

    loadExternalLinks()
  }, [id])

  useEffect(() => {
    if (!isCalendarOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false)
      }
    }
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCalendarOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isCalendarOpen])

  useEffect(() => {
    return () => {
      if (panelTimerRef.current) {
        window.clearTimeout(panelTimerRef.current)
        panelTimerRef.current = null
      }
      if (panelAnimationFrameRef.current) {
        cancelAnimationFrame(panelAnimationFrameRef.current)
        panelAnimationFrameRef.current = null
      }
    }
  }, [])

  const accessState = useMemo(() => {
    const matches = (a: string | null | undefined, b: string | null | undefined) =>
      !!a && !!b && String(a) === String(b)

    if (!diary) {
      return {
        hasBaseAccess: false,
        isOwner: false,
        isClientAccess: false,
        organizationAccountAccess: false,
        organizationEmployeeAccess: false,
        caregiverAccess: false,
        canManageDiarySettings: false,
        canEditCardSettings: false,
        canManageMetricsSettings: false,
        canManageAccessSettings: false,
      }
    }

    const isOwner = matches(diary.owner_id, userId)
    
    // Проверяем доступ клиента
    // Если дневник загружен, значит RLS разрешил доступ через has_diary_access
    // Дополнительно проверяем через organizationClientLink (принятое приглашение)
    let isClientAccess = false
    if (userRole === 'client') {
      console.log('[DiaryPage] Проверка доступа клиента:', {
        diaryId: diary.id,
        diaryClientId: diary.client_id,
        userId,
        organizationClientLink: organizationClientLink?.accepted_by,
      })
      
      // Если дневник загружен, значит RLS разрешил доступ через has_diary_access
      // Это означает, что клиент имеет доступ (либо через owner_client_id, либо через diary_client_links)
      // Поэтому если дневник загружен и пользователь - клиент, то доступ есть
      if (diary.id) {
        isClientAccess = true
        console.log('[DiaryPage] ✅ Клиент имеет доступ через RLS (дневник загружен)')
      }
      // Дополнительная проверка через organizationClientLink (принятое приглашение)
      if (organizationClientLink?.accepted_by === userId) {
        isClientAccess = true
        console.log('[DiaryPage] ✅ Клиент имеет доступ через organizationClientLink')
      }
    } else {
      console.log('[DiaryPage] ⚠️ userRole не является client:', userRole, 'userId:', userId)
    }
    
    // Для организаций: проверяем organization_id или created_by (кто создал дневник)
    // Используем finalEffectiveOrganizationId для более точного определения
    const organizationAccountAccess =
      isOrganizationAccount &&
      (matches(diary.organization_id, finalEffectiveOrganizationId || effectiveOrganizationId) ||
        matches(diary.organization_id, userId) ||
        (!diary.organization_id && matches(diary.owner_id, finalEffectiveOrganizationId || effectiveOrganizationId)) ||
        (!diary.organization_id && matches(diary.owner_id, userId)))
    const assignedEmployeeIds = assignedEmployees.map(employee => employee.user_id)
    // Для патронажных агентств требуется явное назначение через diary_employee_access
    // Для пансионатов доступ ко всем дневникам организации автоматически (без явного назначения)
    // ВАЖНО: Администраторы и руководители имеют доступ ко всем дневникам организации независимо от назначения
    const requiresAssignment = assignmentOrganizationType === 'patronage_agency'
    
    // Проверяем, является ли сотрудник администратором или руководителем
    // Проверяем как в assignedEmployees, так и в availableOrgEmployees (для пансионатов)
    let isAdminOrManager = false
    if (isOrgEmployee && userId) {
      // Сначала проверяем в assignedEmployees
      const employee = assignedEmployees.find(emp => emp.user_id === userId)
      if (employee && (employee.role === 'admin' || employee.role === 'manager')) {
        isAdminOrManager = true
      } else {
        // Если не найден в assignedEmployees, проверяем в availableOrgEmployees
        const availableEmployee = availableOrgEmployees.find(emp => emp.user_id === userId)
        if (availableEmployee && (availableEmployee.role === 'admin' || availableEmployee.role === 'manager')) {
          isAdminOrManager = true
        }
      }
    }
    
    const hasEmployeeAssignment =
      !requiresAssignment || 
      isAdminOrManager || // Администраторы и руководители всегда имеют доступ
      (userId ? assignedEmployeeIds.includes(userId) : false)
    // Для сотрудников: проверяем доступ через organization_id из дневника или через userOrganizationId/employeeOrganizationId
    // employeeOrganizationId загружается из organization_employees
    const organizationEmployeeAccess =
      isOrgEmployee &&
      (matches(diary.organization_id, employeeOrganizationId || userOrganizationId || finalEffectiveOrganizationId || effectiveOrganizationId) ||
        (!diary.organization_id && matches(diary.owner_id, employeeOrganizationId || userOrganizationId || finalEffectiveOrganizationId || effectiveOrganizationId))) &&
      hasEmployeeAssignment
    const caregiverAccess =
      (isCaregiver || !!effectiveCaregiverId) && matches(diary.caregiver_id, effectiveCaregiverId)

    const hasBaseAccess =
      isOwner || isClientAccess || organizationAccountAccess || organizationEmployeeAccess || caregiverAccess

    console.log('[DiaryPage] accessState calculation:', {
      isOwner,
      isClientAccess,
      organizationAccountAccess,
      organizationEmployeeAccess,
      caregiverAccess,
      hasBaseAccess,
      userRole,
      userId,
      diaryId: diary.id,
      diaryClientId: diary.client_id,
    })

    return {
      hasBaseAccess,
      isOwner,
      isClientAccess,
      organizationAccountAccess,
      organizationEmployeeAccess,
      caregiverAccess,
      canManageDiarySettings: isOwner || organizationAccountAccess,
      // Администраторы и руководители могут редактировать карточку через organizationAccountAccess или organizationEmployeeAccess
      canEditCardSettings: isOwner || isClientAccess || organizationAccountAccess,
      // ВАЖНО: Сиделки могут редактировать показатели (заполнять и просматривать)
      // Администраторы и руководители также могут редактировать показатели
      canManageMetricsSettings: isOwner || isClientAccess || organizationAccountAccess || caregiverAccess,
      canManageAccessSettings: isOwner || isClientAccess || organizationAccountAccess,
    }
  }, [
    diary,
    userId,
    userRole, // ВАЖНО: добавляем userRole в зависимости, чтобы accessState пересчитывался при изменении роли
    effectiveOrganizationId,
    finalEffectiveOrganizationId, // Используем finalEffectiveOrganizationId для сотрудников
    userOrganizationId,
    employeeOrganizationId, // Добавляем для сотрудников
    effectiveCaregiverId,
    caregiverOrganizationId, // Добавляем caregiverOrganizationId в зависимости
    isOrganizationAccount,
    isOrgEmployee,
    isCaregiver,
    assignedEmployees,
    availableOrgEmployees, // Добавляем для проверки роли администратора/руководителя
    organizationType,
    assignmentOrganizationType, // Добавляем для правильной проверки типа организации
    organizationClientLink, // Добавляем organizationClientLink для проверки доступа через приглашение
  ])

  // Функция для загрузки назначенных сотрудников из Supabase
  const loadAssignedEmployees = async () => {
    if (!diary || !id) return

    try {
      // Загружаем назначенных сотрудников (для пансионатов - все записи, включая отозванные)
      const { data: accessData, error: accessError } = await supabase
        .from('diary_employee_access')
        .select('user_id, revoked_at')
        .eq('diary_id', id)

      if (accessError) {
        console.error('Ошибка загрузки назначенных сотрудников:', accessError)
        return []
      }

      // Для пансионатов: загружаем все записи (нужны для проверки revoked_at)
      // Для патронажных агентств: только активные доступы
      const activeAccessData = (accessData || []).filter((item: any) => {
        if (assignmentOrganizationType === 'pension') {
          return true // Возвращаем все записи для пансионатов
        }
        return !item.revoked_at // Для патронажных агентств только активные
      })
      
      if (activeAccessData.length === 0 && assignmentOrganizationType !== 'pension') {
        return []
      }

      // Получаем user_id из доступа
      const userIds = activeAccessData.map((item: any) => item.user_id).filter(Boolean)

      if (userIds.length === 0 && assignmentOrganizationType !== 'pension') {
        return []
      }

      // Загружаем данные сотрудников
      const { data: employeesData, error: employeesError } = await supabase
        .from('organization_employees')
        .select(`
          user_id,
          first_name,
          last_name,
          role,
          organization_id,
          organizations (
            organization_type
          )
        `)
        .in('user_id', userIds.length > 0 ? userIds : [])

      if (employeesError) {
        console.error('Ошибка загрузки данных сотрудников:', employeesError)
        return []
      }

      // Преобразуем данные, включая информацию о revoked_at для пансионатов
      const accessMap = new Map(activeAccessData.map((item: any) => [item.user_id, item.revoked_at]))
      return (employeesData || []).map((emp: any) => ({
        user_id: emp.user_id,
        first_name: emp.first_name || '',
        last_name: emp.last_name || '',
        role: emp.role || '',
        organization_type: (emp.organizations as any)?.organization_type || null,
        revoked_at: accessMap.get(emp.user_id) || null, // Добавляем информацию о revoked_at
      }))
    } catch (error) {
      console.error('Ошибка загрузки назначенных сотрудников:', error)
      return []
    }
  }

  useEffect(() => {
    if (!diary) return

    setAssignmentsLoaded(false)

    const loadData = async () => {
      let normalizedAssignments: Array<{ user_id: string; first_name?: string; last_name?: string; role?: string; organization_type?: OrganizationType | null }> = []

      // Загружаем из Supabase
      const assignments = await loadAssignedEmployees()
      normalizedAssignments = assignments || []

    let employeesForOrganization: Array<{ user_id: string; first_name?: string; last_name?: string; role?: string }> = []

      // Загружаем сотрудников для организаций и руководителей/администраторов
      // Для руководителей загружаем всегда, не дожидаясь загрузки employeePermissions
      if (isOrganizationAccount || isOrgEmployee) {
        try {
          // Загружаем organization_id из таблицы organizations по user_id
          // effectiveOrganizationId может быть user_id, а нам нужен organization_id
          let orgId = normalizeId(diary.organization_id)
          
          // Если organization_id нет в дневнике, получаем его
          if (!orgId) {
            // Для сотрудников используем уже загруженный employeeOrganizationId
            if (isOrgEmployee && employeeOrganizationId) {
              orgId = employeeOrganizationId
              console.log('[DiaryPage] Using employeeOrganizationId:', orgId)
            } else if (userId) {
              // Для сотрудников получаем organization_id из organization_employees (если еще не загружен)
              if (isOrgEmployee) {
                const { data: employeeData, error: employeeError } = await supabase
                  .from('organization_employees')
                  .select('organization_id')
                  .eq('user_id', userId)
                  .maybeSingle()
                
                if (!employeeError && employeeData?.organization_id) {
                  orgId = employeeData.organization_id
                  console.log('[DiaryPage] Loaded organization_id from organization_employees:', orgId)
                }
              }
              
              // Если не нашли через organization_employees, пробуем через organizations
              if (!orgId) {
                const { data: orgData, error: orgError } = await supabase
                  .from('organizations')
                  .select('id')
                  .eq('user_id', userId)
                  .single()
                
                if (!orgError && orgData?.id) {
                  orgId = orgData.id
                  console.log('[DiaryPage] Loaded organization_id from organizations table:', orgId)
        } else {
                  // Fallback: используем finalEffectiveOrganizationId или effectiveOrganizationId
                  orgId = normalizeId(finalEffectiveOrganizationId || effectiveOrganizationId)
                  console.log('[DiaryPage] Using finalEffectiveOrganizationId/effectiveOrganizationId as fallback:', orgId)
                }
              }
            } else {
              // Если нет userId, используем finalEffectiveOrganizationId или effectiveOrganizationId
              orgId = normalizeId(finalEffectiveOrganizationId || effectiveOrganizationId)
            }
          }

          if (orgId) {
            console.log('[DiaryPage] Loading employees for organization_id:', orgId)
            const { data: employeesData, error: employeesError } = await supabase
              .from('organization_employees')
              .select(`
                user_id,
                first_name,
                last_name,
                role,
                organizations!inner (
                  organization_type
                )
              `)
              .eq('organization_id', orgId)

            if (employeesError) {
              console.error('[DiaryPage] Error loading employees:', employeesError)
            } else if (employeesData) {
              console.log('[DiaryPage] Loaded employees:', employeesData.length)
              employeesForOrganization = employeesData.map((emp: any) => ({
                user_id: emp.user_id,
                first_name: emp.first_name || '',
                last_name: emp.last_name || '',
                role: emp.role || '',
                organization_type: emp.organizations?.organization_type || null,
              }))
            }
          } else {
            console.warn('[DiaryPage] No organization_id found for loading employees')
          }

          // Если сотрудники не найдены, используем пустой массив
          if (employeesForOrganization.length === 0) {
            console.warn('[DiaryPage] Сотрудники не найдены для организации:', {
              orgId,
              effectiveOrganizationId,
              diaryOrganizationId: diary.organization_id,
              userId
            })
          }
      } catch (error) {
          console.error('[DiaryPage] Не удалось загрузить сотрудников организации', error)
        employeesForOrganization = []
      }
    }

    setAvailableOrgEmployees(employeesForOrganization)

    // Для пансионатов по умолчанию все сотрудники имеют доступ, если доступы не настроены явно.
      // НО: не назначаем автоматически, если есть записи с revoked_at (значит доступы уже управлялись)
    let assignmentsToPersist: Array<{ user_id: string; first_name?: string; last_name?: string; role?: string }> | null =
      null
      
      // Проверяем, есть ли записи в diary_employee_access (даже с revoked_at)
      // Если есть - значит доступы уже управлялись, не назначаем автоматически
      let hasAnyAccessRecords = false
      if ((isOrganizationAccount || isOrgEmployee) && assignmentOrganizationType === 'pension' && id) {
        const { data: anyAccessData } = await supabase
          .from('diary_employee_access')
          .select('user_id')
          .eq('diary_id', id)
          .limit(1)
        
        hasAnyAccessRecords = (anyAccessData?.length || 0) > 0
      }
      
      if (
        (isOrganizationAccount || isOrgEmployee) &&
        assignmentOrganizationType === 'pension' &&
      normalizedAssignments.length === 0 &&
        employeesForOrganization.length > 0 &&
        !hasAnyAccessRecords // Не назначаем автоматически, если доступы уже управлялись
    ) {
      normalizedAssignments = employeesForOrganization
      assignmentsToPersist = employeesForOrganization
      console.log('[DiaryPage] auto-assign all employees for pension', assignmentsToPersist)
      } else if ((isOrganizationAccount || isOrgEmployee) && employeesForOrganization.length > 0) {
      // Удаляем из доступа сотрудников, которых больше нет в организации.
      const filteredAssignments = normalizedAssignments.filter(assignment =>
        employeesForOrganization.some(employee => employee.user_id === assignment.user_id)
      )
      if (filteredAssignments.length !== normalizedAssignments.length) {
        normalizedAssignments = filteredAssignments
        assignmentsToPersist = filteredAssignments
        console.log('[DiaryPage] cleaned assignment list', { normalizedAssignments })
      }
    }

    if (assignmentsToPersist) {
      try {
          // Для пансионатов автоматически назначаем всех сотрудников через RPC
          if (assignmentOrganizationType === 'pension') {
            for (const employee of assignmentsToPersist) {
              try {
                await supabase.rpc('assign_employee_to_diary', {
                  p_diary_id: diary.id,
                  p_user_id: employee.user_id,
                })
              } catch (error) {
                console.warn('Не удалось назначить доступ сотруднику:', error)
              }
            }
          }
      } catch (error) {
        console.warn('Не удалось сохранить доступ сотрудников организации', error)
      }
    }

    setAssignedEmployees(normalizedAssignments)
    setAssignmentsLoaded(true)
    }

    loadData()
  }, [diary, isOrganizationAccount, isOrgEmployee, organizationType, effectiveOrganizationId, userId, id])

  useEffect(() => {
    if (!diary) return
    console.log('[DiaryPage] assignedEmployees changed', assignedEmployees)
  }, [assignedEmployees, diary])

  const assignedEmployeesDisplay = useMemo(() => {
    const map = new Map<
      string,
      { user_id: string; first_name?: string; last_name?: string; role?: string; organization_type?: OrganizationType | null }
    >()
    assignedEmployees.forEach(employee => {
      map.set(String(employee.user_id), employee)
    })
    availableOrgEmployees.forEach(employee => {
      const key = String(employee.user_id)
      if (map.has(key)) {
        map.set(key, {
          user_id: employee.user_id,
          first_name: employee.first_name,
          last_name: employee.last_name,
          role: employee.role,
          organization_type: employee.organization_type || map.get(key)?.organization_type || null,
        })
      }
    })
    return Array.from(map.values())
  }, [assignedEmployees, availableOrgEmployees])

  const {
    hasBaseAccess,
    organizationAccountAccess,
    organizationEmployeeAccess,
    caregiverAccess,
    canEditCardSettings: baseCanEditCardSettings,
    canManageMetricsSettings: baseCanManageMetricsSettings,
    canManageAccessSettings: baseCanManageAccessSettings,
  } = accessState

  // Дополнительная проверка прав сотрудников
  const [employeePermissions, setEmployeePermissions] = useState<{
    canEditCard: boolean
    canManageMetrics: boolean
    canManageClientAccess: boolean
    canManageEmployeeAccess: boolean
  }>({
    canEditCard: false,
    canManageMetrics: false,
    canManageClientAccess: false,
    canManageEmployeeAccess: false,
  })

  useEffect(() => {
    const checkEmployeePermissions = async () => {
      if (!user || !isOrgEmployee) {
        setEmployeePermissions({
          canEditCard: false,
          canManageMetrics: false,
          canManageClientAccess: false,
          canManageEmployeeAccess: false,
        })
        return
      }

      try {
        const [canEdit, canManageClient, canManageEmployee, canEditMetrics] = await Promise.all([
          canEditDiariesAndCards(user),
          canManageClientAccess(user),
          canManageEmployeeAccess(user),
          canEditDiaryMetrics(user),
        ])

        setEmployeePermissions({
          canEditCard: canEdit,
          canManageMetrics: canEditMetrics, // Администраторы и руководители могут редактировать показатели
          canManageClientAccess: canManageClient,
          canManageEmployeeAccess: canManageEmployee,
        })
      } catch (error) {
        console.error('Ошибка проверки прав сотрудника:', error)
        setEmployeePermissions({
          canEditCard: false,
          canManageMetrics: false,
          canManageClientAccess: false,
          canManageEmployeeAccess: false,
        })
      }
    }

    checkEmployeePermissions()
  }, [user, isOrgEmployee])

  // Объединяем базовые права с правами сотрудников
  const canEditCardSettings = baseCanEditCardSettings || (isOrgEmployee && employeePermissions.canEditCard)
  const canManageMetricsSettings = baseCanManageMetricsSettings || (isOrgEmployee && employeePermissions.canManageMetrics)
  // ВАЖНО: Для сотрудников доступ к управлению доступами определяется ТОЛЬКО через employeePermissions
  // Админы НЕ должны иметь доступ к управлению доступами (только руководители)
  const canManageAccessSettings = isOrgEmployee 
    ? (employeePermissions.canManageClientAccess || employeePermissions.canManageEmployeeAccess)
    : baseCanManageAccessSettings

  useEffect(() => {
    if (!diary) return
    console.log('[DiaryPage] access state', {
      diaryId: diary.id,
      owner_id: diary.owner_id,
      client_id: diary.client_id,
      organization_id: diary.organization_id,
      caregiver_id: diary.caregiver_id,
      userId,
      effectiveOrganizationId,
      userOrganizationId,
      effectiveCaregiverId,
      roles: { isOrganization, isOrgEmployee, isCaregiver, isClient },
      organizationAccountAccess,
      organizationEmployeeAccess,
      caregiverAccess,
      hasBaseAccess,
    })
  }, [
    diary,
    userId,
    effectiveOrganizationId,
    userOrganizationId,
    effectiveCaregiverId,
    isOrganization,
    isOrgEmployee,
    isCaregiver,
    isClient,
    organizationAccountAccess,
    organizationEmployeeAccess,
    caregiverAccess,
    hasBaseAccess,
  ])

  const availableSettingsSections = useMemo(
    () =>
      [
        canEditCardSettings ? { id: 'card' as const, label: 'Карточка' } : null,
        canManageMetricsSettings ? { id: 'metrics' as const, label: 'Показатели' } : null,
        canManageAccessSettings ? { id: 'access' as const, label: 'Доступ' } : null,
      ].filter(Boolean) as Array<{ id: 'card' | 'metrics' | 'access'; label: string }>,
    [canEditCardSettings, canManageMetricsSettings, canManageAccessSettings]
  )

  useEffect(() => {
    if (!isSettingsOpen) return

    setSettingsMessage(null)
    setSettingsError(null)

    console.log('[DiaryPage] Settings modal opened', {
      sections: availableSettingsSections.map(section => section.id),
      canEditCardSettings,
      canManageMetricsSettings,
      canManageAccessSettings,
    })

    if (availableSettingsSections.length > 0) {
      setSettingsSection(prev =>
        availableSettingsSections.some(section => section.id === prev)
          ? prev
          : availableSettingsSections[0].id
      )
    }

    if (patientCard) {
      setCardDraft({
        fullName: patientCard.full_name,
        dateOfBirth: patientCard.date_of_birth || '',
        address: patientCard.address || '',
        diagnoses: Array.isArray(patientCard.diagnoses) ? patientCard.diagnoses.join(', ') : '',
        mobility: patientCard.mobility,
      })
    }

    const selectedTypes = Array.from(new Set(metrics.map(metric => metric.metric_type)))
    setMetricsDraftSelected(selectedTypes)
    setMetricsDraftPinned(
      metrics
        .filter(metric => metric.is_pinned)
        .map(metric => metric.metric_type)
        .filter(type => selectedTypes.includes(type))
    )
  }, [
    isSettingsOpen,
    patientCard,
    metrics,
    availableSettingsSections,
    canEditCardSettings,
    canManageMetricsSettings,
    canManageAccessSettings,
  ])

  useEffect(() => {
    if (!isSettingsOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isSettingsOpen])

  const canEditMetrics = () => hasBaseAccess
  const canFillMetrics = canEditMetrics()

  type EmployeeAccessEntry = {
    user_id: string
    first_name?: string
    last_name?: string
    role?: string
    organization_type?: OrganizationType | null
  }

  const persistAssignedEmployees = (next: EmployeeAccessEntry[]) => {
    if (!diary) return
    // Сохранение идет через RPC assign_employee_to_diary / remove_employee_from_diary
    // localStorage больше не используется
      console.log('[DiaryPage] persistAssignedEmployees', { diaryId: diary.id, next })
      setAssignedEmployees(next)
  }

  // Функция для назначения доступа сотруднику
  const handleAddEmployeeAccess = async (employeeId?: string) => {
    if (!diary || !id) return
    const targetId = employeeId || selectedEmployeeId
    if (!targetId) {
      console.warn('[DiaryPage] handleAddEmployeeAccess: targetId is empty')
      return
    }
    const normalizeTarget = (value: unknown) => String(value)

    // Проверяем, есть ли уже активный доступ (для пансионатов учитываем revoked_at)
    const existingEmployee = assignedEmployees.find(
      item => normalizeTarget(item.user_id) === normalizeTarget(targetId)
    )
    
    // Если сотрудник есть в списке и у него нет revoked_at (активный доступ), не добавляем
    if (existingEmployee && !existingEmployee.revoked_at) {
      if (!employeeId) {
        setSelectedEmployeeId('')
      }
      console.log('[DiaryPage] handleAddEmployeeAccess: already has active access', { targetId })
      return
    }
    
    // Если сотрудник есть в списке, но у него revoked_at (для пансионатов), продолжаем - это восстановление доступа

    try {
      // Используем RPC для назначения доступа
      const { error } = await supabase.rpc('assign_employee_to_diary', {
        p_diary_id: id,
        p_user_id: targetId,
      })

      if (error) {
        console.error('Ошибка назначения доступа:', error)
        alert(error.message || 'Не удалось назначить доступ. Попробуйте позже.')
      return
    }

      // Перезагружаем список назначенных сотрудников из БД
      const updatedAssignments = await loadAssignedEmployees()
      setAssignedEmployees(updatedAssignments || [])
      
      if (!employeeId) {
        setSelectedEmployeeId('')
      }
      setSettingsError(null)
      
      console.log('[DiaryPage] Доступ сотрудника предоставлен, список обновлен')
    } catch (error) {
      console.error('Ошибка назначения доступа:', error)
      alert('Не удалось назначить доступ. Попробуйте позже.')
    }
  }

  const handleRemoveEmployeeAccess = async (userId: string) => {
    if (!diary || !id) return

    const confirmed = window.confirm('Убрать доступ у сотрудника к этому дневнику?')
    if (!confirmed) return

    try {
      // Используем RPC для отзыва доступа
      const { error } = await supabase.rpc('remove_employee_from_diary', {
        p_diary_id: id,
        p_user_id: userId,
      })

      if (error) {
        console.error('Ошибка отзыва доступа:', error)
        alert('Не удалось отозвать доступ. Попробуйте позже.')
        return
      }

      // Перезагружаем список назначенных сотрудников из БД
      const updatedAssignments = await loadAssignedEmployees()
      setAssignedEmployees(updatedAssignments || [])
      
      console.log('[DiaryPage] Доступ сотрудника отозван, список обновлен')
    } catch (error) {
      console.error('Ошибка отзыва доступа:', error)
      alert('Не удалось отозвать доступ. Попробуйте позже.')
    }
  }

  const handleRemoveAccess = async (accessType: 'caregiver' | 'organization') => {
    if (!diary || !id) return

    const confirmed = window.confirm(
      accessType === 'caregiver' 
        ? 'Вы уверены, что хотите отозвать доступ у сиделки?' 
        : 'Вы уверены, что хотите отозвать доступ у организации?'
    )

    if (!confirmed) return

    try {
      // Обновляем дневник в Supabase
      const updateField = accessType === 'caregiver' ? 'caregiver_id' : 'organization_id'
      const { error: updateError } = await supabase
        .from('diaries')
        .update({ [updateField]: null })
        .eq('id', id)

      if (updateError) {
        console.error('Ошибка отзыва доступа:', updateError)
        alert('Не удалось отозвать доступ. Попробуйте позже.')
        return
      }

    // Обновляем состояние
    setDiary({
      ...diary,
        [updateField]: null
      })

      if (accessType === 'caregiver') {
        // При отзыве доступа у сиделки просто убираем caregiver_id из дневника
        // Карточка подопечного остается у клиента и НЕ удаляется
        // Дневник также остается у клиента, просто сиделка теряет к нему доступ
        console.log('[DiaryPage] Доступ сиделки отозван, дневник и карточка остаются у клиента')
      } else if (accessType === 'organization') {
        // Очищаем информацию об организации
        setOrganizationInfo(null)
      persistAssignedEmployees([])
        // Удаляем ссылку клиента из Supabase при отзыве доступа организации
        try {
          const { error: deleteError } = await supabase
            .from('diary_client_links')
            .delete()
            .eq('diary_id', id)

          if (deleteError) {
            console.warn('Не удалось удалить ссылку клиента при отзыве доступа организации:', deleteError)
        }
      } catch (error) {
        console.warn('Не удалось очистить ссылку клиента при удалении доступа организации', error)
      }
      setOrganizationClientLink(null)
      setAttachedClient(null)
    }

    alert('Доступ успешно отозван')
    } catch (error) {
      console.error('Ошибка отзыва доступа:', error)
      alert('Не удалось отозвать доступ. Попробуйте позже.')
    }
  }

  useEffect(() => {
    if (!user) {
      const clientInviteToken = searchParams.get('client')
      const accessToken = searchParams.get('access')
      
      if (clientInviteToken) {
        navigate(`/client-invite?diary=${id}&token=${clientInviteToken}`, { replace: true })
      } else if (accessToken) {
        // Регистрируем попытку принять приглашение через бэкенд
        const registerAttempt = async () => {
          try {
            await supabase.rpc('register_diary_access_attempt', {
              p_link_token: accessToken,
              p_user_id: null,
              p_user_email: null,
              p_user_phone: null
            })
          } catch (error) {
            console.error('[DiaryPage] Ошибка регистрации попытки принять приглашение:', error)
          }
        }
        registerAttempt()
        navigate('/login')
      } else {
        navigate('/login')
      }
      return
    }

    // Загружаем дневник из Supabase
    const loadDiary = async () => {
      if (!id) return

      try {
        const { data: diaryData, error: diaryError } = await supabase
          .from('diaries')
          .select('*')
          .eq('id', id)
          .single()

        if (diaryError || !diaryData) {
          console.error('Ошибка загрузки дневника:', diaryError)
          console.error('Детали ошибки:', {
            code: diaryError?.code,
            message: diaryError?.message,
            details: diaryError?.details,
            hint: diaryError?.hint,
            userId: user?.id,
            userRole: userRole,
          })
          
          // Если ошибка доступа (RLS блокирует), показываем более информативное сообщение
          if (diaryError?.code === 'PGRST301' || diaryError?.message?.includes('permission') || diaryError?.message?.includes('access')) {
            console.error('Доступ заблокирован RLS. Проверьте has_diary_access для этого дневника.')
          }
          
          alert('Не удалось загрузить дневник. Попробуйте позже.')
      navigate('/dashboard')
      return
    }
    
        // Преобразуем данные из Supabase в формат Diary
        const normalizedDiary: Diary = {
          id: diaryData.id,
          owner_id: diaryData.created_by || diaryData.owner_client_id || '',
          // client_id должен быть owner_client_id (может быть null для организаций)
          client_id: diaryData.owner_client_id || null,
          patient_card_id: diaryData.patient_card_id,
          caregiver_id: diaryData.caregiver_id,
          organization_id: diaryData.organization_id,
          organization_type: diaryData.organization_type || organizationType || currentUser.organization_type || null,
          created_at: diaryData.created_at,
        }

        setDiary(normalizedDiary)

        // Загружаем информацию об организации, если она привязана к дневнику
        if (normalizedDiary.organization_id) {
          try {
            const { data: orgData, error: orgError } = await supabase
              .from('organizations')
              .select('id, name, type')
              .eq('id', normalizedDiary.organization_id)
              .single()

            if (!orgError && orgData) {
              setOrganizationInfo({
                id: orgData.id,
                name: orgData.name || 'Организация',
                type: orgData.type,
              })
            } else {
              setOrganizationInfo(null)
            }
          } catch (error) {
            console.error('Ошибка загрузки информации об организации:', error)
            setOrganizationInfo(null)
          }
        } else {
          setOrganizationInfo(null)
        }

        // Загружаем карточку подопечного из Supabase
        if (normalizedDiary.patient_card_id) {
          const { data: cardData, error: cardError } = await supabase
            .from('patient_cards')
            .select('*')
            .eq('id', normalizedDiary.patient_card_id)
            .single()

          if (!cardError && cardData) {
            const normalizedCard: PatientCard = {
              id: cardData.id,
              client_id: cardData.client_id || '',
              full_name: cardData.full_name,
              date_of_birth: cardData.date_of_birth,
              gender: cardData.gender as 'male' | 'female',
              diagnoses: Array.isArray(cardData.diagnoses) ? cardData.diagnoses : [],
              mobility: cardData.mobility as 'walks' | 'sits' | 'lies',
              address: (cardData.metadata as any)?.address || null,
            }
            setPatientCard(normalizedCard)
          } else {
            console.error('Ошибка загрузки карточки:', cardError)
            alert('Не удалось загрузить карточку подопечного.')
          }
        }
      } catch (error) {
        console.error('Ошибка загрузки дневника:', error)
        navigate('/dashboard')
      }
    }

    loadDiary()

    // Загружаем показатели дневника из Supabase
    const loadMetrics = async () => {
      if (!id) return

      try {
        const { data: metricsData, error: metricsError } = await supabase
          .from('diary_metrics')
          .select('*')
          .eq('diary_id', id)

        if (metricsError) {
          console.error('Ошибка загрузки метрик:', metricsError)
          setMetrics([])
          setMetricSettings({})
        } else {
          const loadedMetrics = (metricsData || []).map((m: any) => ({
            id: m.id,
            diary_id: m.diary_id,
            metric_type: m.metric_key,
            is_pinned: m.is_pinned,
            settings: m.metadata?.settings || undefined,
            metadata: m.metadata || {}, // Сохраняем metadata для доступа к label и category
          }))
          setMetrics(loadedMetrics)
          
          // Загружаем настройки из metadata.settings каждой метрики
          const loadedSettings: Record<string, MetricSettings> = {}
          loadedMetrics.forEach((metric: DiaryMetric) => {
            if (metric.settings) {
        loadedSettings[metric.metric_type] = normalizeSettings(metric.settings)
      }
    })
          setMetricSettings(loadedSettings)
        }
      } catch (error) {
        console.error('Ошибка загрузки метрик:', error)
      }
    }

    // Загружаем значения показателей из Supabase
    const loadMetricValues = async () => {
      if (!id) return

      try {
        // Загружаем последние значения метрик из diary_metric_values
        // Это основной источник данных, diary_history используется только для истории за конкретную дату
        const { data: valuesData, error: valuesError } = await supabase
          .from('diary_metric_values')
          .select('*')
          .eq('diary_id', id)
          .order('recorded_at', { ascending: false })
          .limit(100)

        if (valuesError) {
          console.error('Ошибка загрузки значений метрик:', valuesError)
          setMetricValues([])
        } else {
          // Преобразуем данные из Supabase в формат DiaryMetricValue
          const supabaseValues = (valuesData || []).map((v: any) => {
            // Извлекаем значение из JSONB (может быть объектом { value: ... } или просто значением)
            let extractedValue = v.value
            if (v.value && typeof v.value === 'object' && 'value' in v.value) {
              extractedValue = v.value.value
            }
            
            return {
              id: v.id,
              diary_id: v.diary_id,
              metric_type: v.metric_key,
              value: extractedValue,
              created_at: v.recorded_at || v.created_at,
            }
          })

          // Дедуплицируем значения (на случай, если есть дубликаты)
          const mergedValues = mergeDiaryEntries(supabaseValues)
          setMetricValues(mergedValues)
        }
      } catch (error) {
        console.error('Ошибка загрузки значений метрик:', error)
      }
    }

    loadMetrics()
    loadMetricValues()

    // Настройки метрик теперь загружаются из diary_metrics.metadata.settings в loadMetrics()
    // localStorage больше не используется для настроек

    setCurrentTime(new Date())
  }, [id, user, navigate, searchParams])

  // Обработка токена доступа к дневнику (через параметр access в URL)
  useEffect(() => {
    if (!id || !user) return

    const accessToken = searchParams.get('access')
    if (!accessToken) return

    const handleDiaryAccessToken = async () => {
      try {
        console.log('[DiaryPage] Обработка токена доступа к дневнику:', accessToken)
        
        // Проверяем, что пользователь - организация, сиделка или сотрудник организации
        const userRole = user.user_metadata?.user_role || user.user_metadata?.role
        const organizationType = user.user_metadata?.organization_type
        
        // Разрешаем обработку для организаций, сиделок и сотрудников организаций
        // ВАЖНО: Для сиделок проверяем organizationType, даже если роль еще не установлена
        const isCaregiver = organizationType === 'caregiver'
        const isOrganization = userRole === 'organization' || userRole === 'org_employee'
        
        if (!isOrganization && !isCaregiver) {
          console.log('[DiaryPage] Пользователь не является организацией, сиделкой или сотрудником, пропускаем обработку токена')
          // Если это сиделка, которая еще не создала организацию, регистрируем попытку для обработки после создания профиля
          if (organizationType === 'caregiver') {
            console.log('[DiaryPage] Сиделка еще не создала организацию, регистрируем попытку для обработки после создания профиля')
            try {
              await supabase.rpc('register_diary_access_attempt', {
                p_link_token: accessToken,
                p_user_id: user.id,
                p_user_email: user.email || null,
                p_user_phone: user.user_metadata?.phone || null
              })
    } catch (error) {
              console.error('[DiaryPage] Ошибка регистрации попытки:', error)
            }
            // Редиректим на страницу настройки профиля, если она еще не заполнена
            navigate('/profile/setup', { replace: true })
          }
          return
        }

        // Вызываем RPC функцию для привязки дневника
        const { data, error } = await supabase.rpc('accept_diary_access_token', {
          p_link_token: accessToken
        })

        if (error) {
          console.error('[DiaryPage] Ошибка привязки дневника по токену:', error)
          
          // Если ошибка связана с тем, что организация не найдена, регистрируем попытку для обработки после создания профиля
          if (error.message?.includes('Организация не найдена') || error.message?.includes('не удалось определить организацию')) {
            console.log('[DiaryPage] Организация не найдена, регистрируем попытку для обработки после создания профиля')
            try {
              await supabase.rpc('register_diary_access_attempt', {
                p_link_token: accessToken,
                p_user_id: user.id,
                p_user_email: user.email || null,
                p_user_phone: user.user_metadata?.phone || null
              })
            } catch (regError) {
              console.error('[DiaryPage] Ошибка регистрации попытки:', regError)
            }
            navigate('/profile/setup', { replace: true })
            return
          }
          
          alert('Ошибка привязки дневника: ' + error.message)
          return
        }

        if (data?.success) {
          console.log('[DiaryPage] Дневник успешно привязан:', data)
          
          // Инвалидируем кэш запросов для dashboard, чтобы дневник появился в списке
          await queryClient.invalidateQueries({ queryKey: ['dashboard-diaries'] })
          
          // Перенаправляем на dashboard, чтобы дневник появился в списке
          alert('Доступ к дневнику получен! Дневник добавлен в ваш список.')
          navigate('/dashboard', { replace: true })
        } else {
          console.error('[DiaryPage] Ошибка привязки дневника:', data?.error)
          
          // Если ошибка связана с тем, что организация не найдена, регистрируем попытку для обработки после создания профиля
          if (data?.error?.includes('Организация не найдена') || data?.error?.includes('не удалось определить организацию')) {
            console.log('[DiaryPage] Организация не найдена, регистрируем попытку для обработки после создания профиля')
            try {
              await supabase.rpc('register_diary_access_attempt', {
                p_link_token: accessToken,
                p_user_id: user.id,
                p_user_email: user.email || null,
                p_user_phone: user.user_metadata?.phone || null
              })
            } catch (error) {
              console.error('[DiaryPage] Ошибка регистрации попытки:', error)
            }
            navigate('/profile/setup', { replace: true })
            return
          }
          
          alert('Ошибка привязки дневника: ' + (data?.error || 'Неизвестная ошибка'))
        }
      } catch (error) {
        console.error('[DiaryPage] Ошибка обработки токена доступа:', error)
        alert('Ошибка обработки токена доступа')
      }
    }

    handleDiaryAccessToken()
  }, [id, user, searchParams, navigate])

  // Обработка принятия приглашения клиентом (через параметр client в URL)
  useEffect(() => {
    if (!id || !user || !diary) return

    const clientToken = searchParams.get('client')
    if (!clientToken) return

    const handleClientAccept = async () => {
      try {
        // Проверяем приглашение через таблицу diary_client_links
        const { data: clientLink, error: linkError } = await supabase
          .from('diary_client_links')
          .select('*')
          .eq('diary_id', id)
          .eq('token', clientToken)
          .maybeSingle()

        if (linkError) {
          console.error('Ошибка проверки приглашения:', linkError)
          alert('Ошибка проверки ссылки приглашения')
      navigate(`/diaries/${id}`, { replace: true })
      return
    }

        if (!clientLink) {
          alert('Ссылка приглашения недействительна или устарела')
      navigate(`/diaries/${id}`, { replace: true })
      return
    }

        // Проверяем, не использована ли ссылка другим пользователем
        if (clientLink.accepted_by && clientLink.accepted_by !== user.id) {
      alert('Эта ссылка уже была использована другим пользователем')
      navigate(`/diaries/${id}`, { replace: true })
      return
    }

        // Получаем client_id из таблицы clients
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (clientError || !clientData) {
          alert('Ошибка: не удалось определить клиента')
          navigate(`/diaries/${id}`, { replace: true })
          return
        }

        const clientId = clientData.id

        // Обновляем запись в diary_client_links
        // Теперь PRIMARY KEY только на diary_id, поэтому используем только diary_id для обновления
        const { error: updateError } = await supabase
          .from('diary_client_links')
          .update({
            client_id: clientId,
            accepted_by: user.id,
            accepted_at: new Date().toISOString(),
          })
          .eq('diary_id', id)
          .eq('token', clientToken) // Дополнительная проверка по токену для безопасности

        if (updateError) {
          console.error('Ошибка обновления diary_client_links:', updateError)
          alert('Ошибка при принятии приглашения')
          navigate(`/diaries/${id}`, { replace: true })
      return
    }

        // Edge Function уже обновил diaries.owner_client_id и patient_cards.client_id при регистрации
        // Перезагружаем данные дневника и карточки
        const { data: updatedDiary, error: diaryError } = await supabase
          .from('diaries')
          .select('*')
          .eq('id', id)
          .single()

        if (!diaryError && updatedDiary) {
          setDiary(updatedDiary as any)
        }

        if (updatedDiary?.patient_card_id) {
          const { data: updatedCard, error: cardError } = await supabase
            .from('patient_cards')
            .select('*')
            .eq('id', updatedDiary.patient_card_id)
            .single()

          if (!cardError && updatedCard) {
      setPatientCard(updatedCard as PatientCard)
          }
        }

        // Обновляем состояние ссылки
        const normalizedLink: DiaryClientLink = {
          link: `${appOrigin}/client-invite?diary=${id}&token=${clientToken}`,
          created_at: clientLink.accepted_at || new Date().toISOString(),
          token: clientToken,
          diary_id: id,
          patient_card_id: diary.patient_card_id,
          organization_id: diary.organization_id ?? effectiveOrganizationId ?? null,
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
          client_id: clientId,
        }

    setOrganizationClientLink(normalizedLink)
    updateAttachedClientInfo(normalizedLink)

    alert('Дневник успешно привязан к вашему аккаунту. Вы можете управлять доступом и делиться дневником со специалистами.')
    navigate(`/diaries/${id}`, { replace: true })
      } catch (error) {
        console.error('Ошибка при принятии приглашения:', error)
        alert('Ошибка при принятии приглашения')
        navigate(`/diaries/${id}`, { replace: true })
      }
    }

    handleClientAccept()
  }, [id, user, diary, searchParams, navigate, effectiveOrganizationId])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  // Разделяем показатели на закрепленные и остальные
  // Отображаем только те показатели, которые были выбраны при создании дневника
  const pinnedMetrics = metrics.filter(m => m.is_pinned)
  
  // Вспомогательная функция для определения категории показателя
  const getMetricCategory = (metricType: string): string | null => {
    if (metricType.startsWith('custom_')) {
      const metric = metrics.find(m => m.metric_type === metricType)
      if (metric) {
        const metadata = (metric as any)?.metadata || {}
        return metadata.category || null
      }
      // Fallback: определяем по префиксу
      if (metricType.startsWith('custom_care_')) return 'care'
      if (metricType.startsWith('custom_physical_')) return 'physical'
      if (metricType.startsWith('custom_excretion_')) return 'excretion'
      if (metricType.startsWith('custom_symptom_')) return 'symptom'
    }
    if (['walk', 'cognitive_games', 'diaper_change', 'hygiene', 'skin_moisturizing', 'meal', 'medications', 'vitamins', 'sleep'].includes(metricType)) {
      return 'care'
    }
    if (['temperature', 'blood_pressure', 'breathing_rate', 'pain_level', 'saturation', 'blood_sugar'].includes(metricType)) {
      return 'physical'
    }
    if (['urination', 'defecation'].includes(metricType)) {
      return 'excretion'
    }
    if (['nausea', 'vomiting', 'shortness_of_breath', 'itching', 'cough', 'dry_mouth', 'hiccups', 'taste_disturbance'].includes(metricType)) {
      return 'symptom'
    }
    return null
  }

  const careMetrics = metrics.filter(
    m => !m.is_pinned && getMetricCategory(m.metric_type) === 'care'
  )
  const physicalMetrics = metrics.filter(
    m => !m.is_pinned && getMetricCategory(m.metric_type) === 'physical'
  )
  const excretionMetrics = metrics.filter(
    m => !m.is_pinned && getMetricCategory(m.metric_type) === 'excretion'
  )
  const symptomMetrics = metrics.filter(
    m => !m.is_pinned && getMetricCategory(m.metric_type) === 'symptom'
  )

  // Получаем последнее значение показателя
  const getLastMetricValue = (metricType: string): string | null => {
    const values = metricValues
      .filter(v => v.metric_type === metricType)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    if (values.length === 0) return null
    
    const lastValue = values[0]
    
    // Для булевых значений (было/не было) показываем галочку или крестик
    if (typeof lastValue.value === 'boolean') {
      return lastValue.value ? '✓' : '✗'
    }
    
    const raw = String(lastValue.value ?? '').trim()
    if (!raw) return null

    // Убираем переносы строк и возможное добавленное время вида HH:MM
    const firstLine = raw.split('\n')[0]
    const sanitized = firstLine.replace(/\s*\d{1,2}:\d{2}$/, '').trim()

    return sanitized || null
  }

  const computeTimeLeft = (times: string[]): string => {
    if (!times || times.length === 0) return 'Выберите время'
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
    const minutesList = times.map(timeStringToMinutes).sort((a, b) => a - b)
    const next = minutesList.find(minutes => minutes > nowMinutes)
    const diff =
      next !== undefined
        ? next - nowMinutes
        : minutesList[0] + MINUTES_IN_DAY - nowMinutes

    const hours = Math.floor(diff / 60)
    const minutes = diff % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const getTimeUntilNext = (metricType: string): string => {
    const settings = metricSettings[metricType]
    if (!settings || !settings.times?.length) return 'Выберите время'
    return computeTimeLeft(settings.times)
  }

  const PANEL_TRANSITION_MS = 520

  // Загружаем историю из Supabase при изменении даты
  const [historyForDate, setHistoryForDate] = useState<DiaryMetricValue[]>([])
  
  useEffect(() => {
    const loadHistoryForDate = async () => {
      if (!id || !selectedDate) {
        setHistoryForDate([])
        return
      }

      try {
        const history = await loadDiaryHistoryEntries(id, selectedDate)
        setHistoryForDate(history)
      } catch (error) {
        console.error('Ошибка загрузки истории для даты:', error)
        setHistoryForDate([])
      }
    }

    loadHistoryForDate()
  }, [id, selectedDate])

  const historyEntries = useMemo(() => {
    if (!selectedDate) return []
    const targetDate = fromInputDate(selectedDate)
    
    // Объединяем и дедуплицируем данные из Supabase и локальные значения
    const allEntries = mergeDiaryEntries([...metricValues, ...historyForDate])
    
    return allEntries
      .filter(entry => {
        const entryDate = new Date(entry.created_at)
        return (
          entryDate.getFullYear() === targetDate.getFullYear() &&
          entryDate.getMonth() === targetDate.getMonth() &&
          entryDate.getDate() === targetDate.getDate()
        )
      })
      .map((entry, index) => {
        let time = new Date(entry.created_at).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        })
        let displayValue: string

        if (typeof entry.value === 'string') {
          const parts = entry.value.split(' · ').map(part => part.trim()).filter(Boolean)
          if (parts.length > 1) {
            const lastPart = parts[parts.length - 1]
            if (/^\d{1,2}:\d{2}$/.test(lastPart)) {
              time = lastPart.padStart(5, '0')
              parts.pop()
            }
          }
          displayValue = parts.join(' · ') || '--'
        } else if (typeof entry.value === 'boolean') {
          displayValue = entry.value ? 'Было' : 'Не было'
        } else {
          displayValue = `${entry.value}`
        }

        // Создаем уникальный ключ для каждой записи
        const uniqueKey = `${entry.id}_${entry.metric_type}_${entry.created_at}_${index}`

        return {
          ...entry,
          label: getMetricLabel(entry.metric_type),
          time,
          displayValue,
          uniqueKey, // Добавляем уникальный ключ для рендеринга
        }
      })
  }, [metricValues, historyForDate, selectedDate])

  const groupedHistoryEntries = useMemo(() => {
    const groups: Record<
      string,
      { metricType: string; label: string; items: Array<(typeof historyEntries)[number]> }
    > = {}
    historyEntries.forEach(entry => {
      if (!groups[entry.metric_type]) {
        groups[entry.metric_type] = {
          metricType: entry.metric_type,
          label: entry.label,
          items: [],
        }
      }
      groups[entry.metric_type].items.push(entry)
    })
    return Object.values(groups).sort((a, b) => a.label.localeCompare(b.label))
  }, [historyEntries])

  const aggregateHistoryGroups = useMemo(() => {
    return {
      medications: groupedHistoryEntries
        .filter(group => ['medications', 'vitamins'].includes(group.metricType))
        .map(group => ({
          ...group,
          items: group.items.sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ),
        })),
      others: groupedHistoryEntries
        .filter(group => !['medications', 'vitamins'].includes(group.metricType))
        .map(group => ({
          ...group,
          items: group.items.sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ),
        })),
    }
  }, [groupedHistoryEntries])

  const medicationEntries = aggregateHistoryGroups.medications
  const otherHistoryEntries = aggregateHistoryGroups.others

  const selectedDateObj = useMemo(() => fromInputDate(selectedDate), [selectedDate])

  const selectedDateLabel = useMemo(() => {
    const formatted = selectedDateObj.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const cleaned = formatted.replace(/\s?г\./, 'г').replace(/\s?г$/, 'г')
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }, [selectedDateObj])

  const calendarDays = useMemo(() => {
    const startOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
    const daysInMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      0
    ).getDate()
    const startWeekday = (startOfMonth.getDay() + 6) % 7
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7
    const todayKey = toInputDate(new Date())

    return Array.from({ length: totalCells }, (_, index) => {
      const date = new Date(startOfMonth)
      date.setDate(date.getDate() + index - startWeekday)
      const dateKey = toInputDate(date)
      return {
        date,
        key: dateKey,
        label: date.getDate(),
        isCurrentMonth: date.getMonth() === calendarMonth.getMonth(),
        isSelected: dateKey === selectedDate,
        isToday: dateKey === todayKey,
      }
    })
  }, [calendarMonth, selectedDate])

  const calendarMonthLabel = useMemo(() => {
    const monthName = calendarMonth
      .toLocaleDateString('ru-RU', { month: 'long' })
      .replace(' г.', '')
    const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1)
    return `${capitalized} ${calendarMonth.getFullYear()}`
  }, [calendarMonth])

  const tabs = useMemo(() => {
    const base: Array<{ id: DiaryTab; label: string }> = [
      { id: 'diary', label: 'Дневник' },
      { id: 'history', label: 'История' },
      // { id: 'route', label: 'Маршрутный лист' },
    ]

    if (isOrganization || (isOrgEmployee && employeePermissions.canManageClientAccess)) {
      base.push({ id: 'client', label: 'Клиент' })
    }

    if (isClient) {
      base.push({ id: 'share', label: 'Поделиться' })
    }

    return base
  }, [isOrganization, isOrgEmployee, employeePermissions.canManageClientAccess, isClient])
  const tabIds = useMemo(() => tabs.map(tab => tab.id), [tabs])
  const handleTabChange = useCallback(
    (direction: 'next' | 'prev') => {
      if (tabIds.length <= 1) return
      const currentIndex = tabIds.indexOf(activeTab)
      if (currentIndex === -1) return
      const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
      if (nextIndex < 0 || nextIndex >= tabIds.length) return
      setActiveTab(tabIds[nextIndex])
    },
    [tabIds, activeTab]
  )
  const swipeStateRef = useRef<{ startX: number; startY: number; active: boolean } | null>(null)
  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (tabIds.length <= 1) return
      const touch = event.touches[0]
      swipeStateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        active: true,
      }
    },
    [tabIds.length]
  )
  const handleTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (!swipeStateRef.current || !swipeStateRef.current.active) return
    const touch = event.touches[0]
    const deltaY = Math.abs(touch.clientY - swipeStateRef.current.startY)
    if (deltaY > 45) {
      swipeStateRef.current.active = false
    }
  }, [])
  const handleTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const state = swipeStateRef.current
      swipeStateRef.current = null
      if (!state || !state.active || tabIds.length <= 1) return
      const touch = event.changedTouches[0]
      const deltaX = touch.clientX - state.startX
      if (Math.abs(deltaX) < 60) return
      handleTabChange(deltaX < 0 ? 'next' : 'prev')
    },
    [handleTabChange, tabIds.length]
  )

  const baseMetricValues = useMemo(
    () =>
      new Set([
        ...careMetricOptionsState.map(option => option.value),
        ...PHYSICAL_METRIC_OPTIONS.map(option => option.value),
        ...EXCRETION_METRIC_OPTIONS.map(option => option.value),
        ...SYMPTOM_METRIC_OPTIONS.map(option => option.value),
      ]),
    [careMetricOptionsState]
  )

  const customDraftMetrics = useMemo(
    () => metricsDraftSelected.filter(type => !baseMetricValues.has(type)),
    [metricsDraftSelected, baseMetricValues]
  )

  const openPanel = (metricType: string, originIndex: number) => {
    if (panelTimerRef.current) {
      window.clearTimeout(panelTimerRef.current)
      panelTimerRef.current = null
    }
    if (panelAnimationFrameRef.current) {
      cancelAnimationFrame(panelAnimationFrameRef.current)
      panelAnimationFrameRef.current = null
    }
    setPanelOriginIndex(originIndex)
    setPanelMetric(metricType)
    panelAnimationFrameRef.current = requestAnimationFrame(() => {
      setPanelVisible(true)
      panelAnimationFrameRef.current = null
    })
  }

  const closePanel = () => {
    if (panelMetric && panelOriginIndex !== null) {
      setAnimatingPinnedMetric({ type: panelMetric, index: panelOriginIndex, direction: 'fromPanel' })
    }

    setPanelVisible(false)
    if (panelTimerRef.current) {
      window.clearTimeout(panelTimerRef.current)
    }
    panelTimerRef.current = window.setTimeout(() => {
      setPanelMetric(null)
      setPanelOriginIndex(null)
      setAnimatingPinnedMetric(null)
      panelTimerRef.current = null
    }, PANEL_TRANSITION_MS)
  }

  const handlePinnedCardClick = (metric: DiaryMetric, index: number) => {
    if (!canFillMetrics) return
    if (animatingPinnedMetric) return

    const startOpenSequence = () => {
      if (index === 0) {
        openPanel(metric.metric_type, index)
      } else {
        setAnimatingPinnedMetric({ type: metric.metric_type, index, direction: 'toPanel' })
        window.setTimeout(() => {
          setAnimatingPinnedMetric(null)
          openPanel(metric.metric_type, index)
        }, PANEL_TRANSITION_MS)
      }
    }

    if (panelMetric) {
      if (panelMetric === metric.metric_type && panelVisible) {
        closePanel()
      } else {
        closePanel()
        window.setTimeout(() => {
          startOpenSequence()
        }, PANEL_TRANSITION_MS)
      }
    } else {
      startOpenSequence()
    }
  }

  const handleRegularMetricClick = (metricType: string) => {
    if (!canFillMetrics) return
    setSelectedMetric({
      type: metricType,
      label: getMetricLabel(metricType),
    })
    setIsMetricModalOpen(true)
  }

  const handleSaveRegularMetric = async (metricType: string, value: string | number | boolean) => {
    if (!id) return

    try {
      // Сохраняем через RPC
      const { data, error } = await supabase.rpc('save_metric_value', {
        p_diary_id: id,
        p_metric_key: metricType,
        p_value: typeof value === 'object' ? value : { value },
        p_recorded_at: new Date().toISOString(),
        p_metadata: {},
      })

      if (error) {
        console.error('Ошибка сохранения метрики:', error)
        alert('Не удалось сохранить значение метрики. Попробуйте позже.')
        return
      }

      // Обновляем локальное состояние
    const entry: DiaryMetricValue = {
        id: data?.id || `value_${Date.now()}`,
      diary_id: id,
      metric_type: metricType,
        value: typeof value === 'object' ? (value as any).value : value,
        created_at: data?.recorded_at || new Date().toISOString(),
    }

    const mergedHistoryValues = mergeDiaryEntries([...metricValues, entry])
    setMetricValues(mergedHistoryValues)
      
      // Перезагружаем значения из Supabase для синхронизации
      setTimeout(async () => {
        try {
          const today = new Date().toISOString().split('T')[0]
          const historyEntries = await loadDiaryHistoryEntries(id!, today)
          
          const { data: valuesData, error: valuesError } = await supabase
            .from('diary_metric_values')
            .select('*')
            .eq('diary_id', id)
            .order('recorded_at', { ascending: false })
            .limit(100)

          if (!valuesError && valuesData) {
            const supabaseValues = (valuesData || []).map((v: any) => {
              let extractedValue = v.value
              if (v.value && typeof v.value === 'object' && 'value' in v.value) {
                extractedValue = v.value.value
              }
              
              return {
                id: v.id,
                diary_id: v.diary_id,
                metric_type: v.metric_key,
                value: extractedValue,
                created_at: v.recorded_at || v.created_at,
              }
            })

            const mergedValues = mergeDiaryEntries([...supabaseValues, ...historyEntries])
            setMetricValues(mergedValues)
          }
        } catch (error) {
          console.error('Ошибка перезагрузки значений:', error)
        }
      }, 500)
    } catch (error) {
      console.error('Ошибка сохранения метрики:', error)
    }
  }

  const handleCreateOrganizationLink = async () => {
    if (!id || !diary?.patient_card_id) {
      alert('Не удалось создать ссылку: отсутствует карточка подопечного')
      return
    }

    try {
      // Определяем organization_id для приглашения
      // Для организаций используем effectiveOrganizationId или organization_id из дневника
      // Для руководителей используем employeeOrganizationId или finalEffectiveOrganizationId
      const orgIdForInvite = isOrgEmployee 
        ? (employeeOrganizationId || finalEffectiveOrganizationId || diary.organization_id)
        : (diary.organization_id || effectiveOrganizationId)

      // Используем RPC для создания приглашения клиента
      const { data: inviteData, error: inviteError } = await supabase.rpc('generate_invite_link', {
        invite_type: 'organization_client',
        payload: {
          patient_card_id: diary.patient_card_id,
          diary_id: id,
          organization_id: orgIdForInvite, // Передаем organization_id для привязки приглашения к организации
        },
      })

      if (inviteError) {
        console.error('Ошибка создания приглашения клиента:', inviteError)
        alert('Ошибка создания ссылки: ' + inviteError.message)
        return
      }

      if (!inviteData || !inviteData.token) {
        alert('Ошибка создания ссылки: токен не получен')
        return
      }

      // Создаем или обновляем запись в diary_client_links для отслеживания статуса
      // Теперь PRIMARY KEY только на diary_id, поэтому можно использовать upsert
      const { error: linkError } = await supabase
        .from('diary_client_links')
        .upsert({
          diary_id: id,
          client_id: null, // Будет заполнено при принятии приглашения
          token: inviteData.token,
          accepted_by: null,
          accepted_at: null,
        }, {
          onConflict: 'diary_id',
        })

      if (linkError) {
        console.error('Ошибка создания записи в diary_client_links:', linkError)
        // Не прерываем выполнение, так как приглашение уже создано
      }

      // Формируем ссылку для клиента
      const link = `${appOrigin}/client-invite?diary=${id}&token=${inviteData.token}`
      
      // Обновляем состояние
      // Используем organization_id из дневника или определяем его для руководителей
      const orgIdForLink = isOrgEmployee 
        ? (employeeOrganizationId || finalEffectiveOrganizationId || diary.organization_id)
        : (diary.organization_id || effectiveOrganizationId)
      
      const normalized: DiaryClientLink = {
      link,
        created_at: inviteData.created_at || new Date().toISOString(),
        token: inviteData.token,
      diary_id: id,
        patient_card_id: diary.patient_card_id,
        organization_id: orgIdForLink ?? null,
      accepted_by: null,
      accepted_at: null,
    }

      setOrganizationClientLink(normalized)
    setAttachedClient(null)

      // Перезагружаем ссылки из БД
      const { data: clientLink } = await supabase
        .from('diary_client_links')
        .select('*')
        .eq('diary_id', id)
        .maybeSingle()

      if (clientLink) {
        const updated: DiaryClientLink = {
          ...normalized,
          accepted_by: clientLink.accepted_by,
          accepted_at: clientLink.accepted_at,
          client_id: clientLink.client_id,
        }
        setOrganizationClientLink(updated)
        updateAttachedClientInfo(updated)
      }
      
      // Перезагружаем список приглашенных клиентов после создания ссылки
      // Используем setTimeout, чтобы дать время базе данных обновиться
      setTimeout(() => {
        // Триггерим перезагрузку через изменение зависимости в useEffect
        // Это произойдет автоматически, так как organizationClientLink изменится
      }, 500)
    } catch (error) {
      console.error('Ошибка создания ссылки для клиента:', error)
      alert('Ошибка создания ссылки')
    }
  }

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      alert('Ссылка скопирована')
    } catch (error) {
      console.error('Clipboard error', error)
      prompt('Скопируйте ссылку вручную', link)
    }
  }

  const openWhatsApp = (link: string, message: string) => {
    const text = `${message}\n${link}`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleCreateExternalLink = async () => {
    if (!id || !user) return

    try {
    const token = crypto.randomUUID()
    const link = `${appOrigin}/diaries/${id}?access=${token}`

      // Создаем запись в diary_external_access_links
      const { data: newLink, error: createError } = await supabase
        .from('diary_external_access_links')
        .insert({
          diary_id: id,
          link_token: token,
          created_by: user.id,
        })
        .select()
        .single()

      if (createError) {
        console.error('Ошибка создания внешней ссылки:', createError)
        alert('Ошибка создания ссылки: ' + createError.message)
        return
      }

      // Обновляем состояние
      const entry = {
        id: newLink.id,
        token: newLink.link_token,
        link,
        invited_email: newLink.invited_email || null,
        invited_phone: newLink.invited_phone || null,
        expires_at: newLink.expires_at || null,
        created_at: newLink.created_at,
      }
      setExternalAccessLinks([...externalAccessLinks, entry])
    } catch (error) {
      console.error('Ошибка создания внешней ссылки:', error)
      alert('Ошибка создания ссылки')
    }
  }

  const handleRevokeExternalLink = async (linkId: string) => {
    if (!id) return

    try {
      // Отзываем ссылку (устанавливаем revoked_at)
      const { error: revokeError } = await supabase
        .from('diary_external_access_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', linkId)
        .eq('diary_id', id)

      if (revokeError) {
        console.error('Ошибка отзыва внешней ссылки:', revokeError)
        alert('Ошибка отзыва ссылки: ' + revokeError.message)
        return
      }

      // Обновляем состояние (убираем отозванную ссылку)
      setExternalAccessLinks(externalAccessLinks.filter(item => item.id !== linkId))
    } catch (error) {
      console.error('Ошибка отзыва внешней ссылки:', error)
      alert('Ошибка отзыва ссылки')
    }
  }

  const handleSaveMetric = async (metricType: string, data: MetricFillData) => {
    if (!id) return

    // Сохранение значения показателя
    const shouldPersistValue =
      data.value !== undefined &&
      data.value !== null &&
      String(data.value).trim() !== ''

    let newValue: DiaryMetricValue | null = null

    if (shouldPersistValue) {
      // Защита от дублирования: проверяем, не было ли уже сохранено такое же значение недавно (в течение последних 2 секунд)
      const now = new Date()
      const twoSecondsAgo = new Date(now.getTime() - 2000)
      const recentDuplicate = metricValues.find(v => 
        v.metric_type === metricType &&
        String(v.value) === String(data.value) &&
        new Date(v.created_at) > twoSecondsAgo
      )
      
      if (recentDuplicate) {
        console.log('[DiaryPage] Пропускаем сохранение: обнаружено дублирование значения', {
          metricType,
          value: data.value,
          recentValue: recentDuplicate
        })
        // Не сохраняем значение, но продолжаем обновлять настройки времени
      } else {
        // Сохраняем значение через RPC save_metric_value
        try {
          const { data: savedData, error: saveError } = await supabase.rpc('save_metric_value', {
            p_diary_id: id,
            p_metric_key: metricType,
            p_value: typeof data.value === 'object' ? data.value : { value: data.value },
            p_recorded_at: new Date().toISOString(),
            p_metadata: {},
          })

          if (saveError) {
            console.error('Ошибка сохранения значения метрики:', saveError)
            alert('Не удалось сохранить значение метрики. Попробуйте позже.')
            return
          }

          // Создаем объект для локального состояния
      newValue = {
            id: savedData?.id || `value_${Date.now()}`,
        diary_id: id,
        metric_type: metricType,
            value: typeof data.value === 'object' ? (data.value as any).value : data.value,
            created_at: savedData?.recorded_at || new Date().toISOString(),
          }
        } catch (error) {
          console.error('Ошибка сохранения значения метрики:', error)
          alert('Не удалось сохранить значение метрики. Попробуйте позже.')
          return
        }
      }
    }

    // Сохранение настроек частоты и напоминаний
    const settings = {
      frequency: data.frequency,
      reminderStart: data.reminderStart,
      reminderEnd: data.reminderEnd,
      times: data.times,
    }
    
    // Сохраняем настройки в diary_metrics.metadata.settings через Supabase
    try {
      // Находим метрику в Supabase
      const { data: existingMetric, error: findError } = await supabase
        .from('diary_metrics')
        .select('id, metadata')
        .eq('diary_id', id)
        .eq('metric_key', metricType)
        .maybeSingle()

      if (findError && findError.code !== 'PGRST116') {
        console.error('Ошибка поиска метрики для сохранения настроек:', findError)
      } else if (existingMetric) {
        // Обновляем metadata.settings для существующей метрики
        const currentMetadata = (existingMetric.metadata as any) || {}
        const updatedMetadata = {
          ...currentMetadata,
            settings: normalizeSettings(settings),
          }

        const { error: updateError } = await supabase
          .from('diary_metrics')
          .update({ metadata: updatedMetadata })
          .eq('id', existingMetric.id)

        if (updateError) {
          console.error('Ошибка сохранения настроек метрики:', updateError)
          alert('Не удалось сохранить настройки метрики. Попробуйте позже.')
        } else {
          // Обновляем локальное состояние метрик
          setMetrics(prev => prev.map(m => 
            m.metric_type === metricType 
              ? { ...m, settings: normalizeSettings(settings) }
              : m
          ))
        }
      } else {
        // Метрика не найдена - создаем новую запись (это не должно происходить, но на всякий случай)
        console.warn('Метрика не найдена для сохранения настроек:', metricType)
        alert('Метрика не найдена. Сначала добавьте метрику в дневник.')
      }
    } catch (error) {
      console.error('Ошибка сохранения настроек метрики:', error)
      alert('Не удалось сохранить настройки метрики. Попробуйте позже.')
    }

    // Обновление состояния
    if (shouldPersistValue && newValue) {
      const mergedHistory = mergeDiaryEntries([...metricValues, newValue])
      setMetricValues(mergedHistory)
      
      // Перезагружаем значения из Supabase для синхронизации
      setTimeout(async () => {
        try {
          const today = new Date().toISOString().split('T')[0]
          const historyEntries = await loadDiaryHistoryEntries(id!, today)
          
          const { data: valuesData, error: valuesError } = await supabase
            .from('diary_metric_values')
            .select('*')
            .eq('diary_id', id)
            .order('recorded_at', { ascending: false })
            .limit(100)

          if (!valuesError && valuesData) {
            const supabaseValues = (valuesData || []).map((v: any) => {
              let extractedValue = v.value
              if (v.value && typeof v.value === 'object' && 'value' in v.value) {
                extractedValue = v.value.value
              }
              
              return {
                id: v.id,
                diary_id: v.diary_id,
                metric_type: v.metric_key,
                value: extractedValue,
                created_at: v.recorded_at || v.created_at,
              }
            })

            const mergedValues = mergeDiaryEntries([...supabaseValues, ...historyEntries])
            setMetricValues(mergedValues)
          }
        } catch (error) {
          console.error('Ошибка перезагрузки значений:', error)
        }
      }, 500)
    }
    setMetricSettings(prev => ({
      ...prev,
      [metricType]: normalizeSettings(settings),
    }))
    setCurrentTime(new Date())
    // Закрываем панель только если было сохранено значение, а не только настройки времени
    if (panelMetric === metricType && shouldPersistValue) {
      closePanel()
    }
  }

  const handleSettingsClose = () => {
    setIsSettingsOpen(false)
    setSettingsMessage(null)
    setSettingsError(null)
  }

  const handleMetricDraftToggle = (metricType: string) => {
    setMetricsDraftSelected(prev => {
      if (prev.includes(metricType)) {
        setMetricsDraftPinned(pinned => pinned.filter(item => item !== metricType))
        return prev.filter(item => item !== metricType)
      }
      setSettingsError(null)
      return [...prev, metricType]
    })
  }

  const handlePinnedDraftToggle = (metricType: string) => {
    setMetricsDraftPinned(prev => {
      if (prev.includes(metricType)) {
        return prev.filter(item => item !== metricType)
      }
      if (prev.length >= 3) {
        setSettingsError('Можно закрепить не более трёх показателей')
        return prev
      }
      setSettingsError(null)
      setMetricsDraftSelected(selected =>
        selected.includes(metricType) ? selected : [...selected, metricType]
      )
      return [...prev, metricType]
    })
  }

  const handleSaveCardDraft = () => {
    if (!canEditCardSettings || !patientCard) return
    setSettingsError(null)

    if (!cardDraft.fullName.trim()) {
      setSettingsError('Введите ФИО подопечного')
      return
    }

    setIsSavingCard(true)
    try {
      const cards = JSON.parse(localStorage.getItem('patient_cards') || '[]') as PatientCard[]
      const normalizedDiagnoses = cardDraft.diagnoses
        ? cardDraft.diagnoses
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
        : []
      const mobilityValue: 'walks' | 'sits' | 'lies' =
        cardDraft.mobility === 'walks' || cardDraft.mobility === 'sits' || cardDraft.mobility === 'lies'
          ? cardDraft.mobility
          : patientCard.mobility
      const updatedCard: PatientCard = {
        ...patientCard,
        full_name: cardDraft.fullName.trim(),
        date_of_birth: cardDraft.dateOfBirth ? cardDraft.dateOfBirth : null,
        address: cardDraft.address ? cardDraft.address.trim() : null,
        diagnoses: normalizedDiagnoses,
        mobility: mobilityValue,
      }

      const nextCards = cards.map(card => (card.id === patientCard.id ? updatedCard : card))
      localStorage.setItem('patient_cards', JSON.stringify(nextCards))

      const storedUserRaw = localStorage.getItem('current_user')
      if (storedUserRaw) {
        try {
          const storedUser = JSON.parse(storedUserRaw)
          const updatedUser = {
            ...storedUser,
            user_metadata: {
              ...(storedUser.user_metadata || {}),
              patient_cards: nextCards,
            },
          }
          localStorage.setItem('current_user', JSON.stringify(updatedUser))
        } catch (error) {
          console.warn('Не удалось обновить current_user при сохранении карточки', error)
        }
      }

      setPatientCard(updatedCard)
      setCardDraft({
        fullName: updatedCard.full_name,
        dateOfBirth: updatedCard.date_of_birth || '',
        address: updatedCard.address || '',
        diagnoses: updatedCard.diagnoses.join(', '),
        mobility: updatedCard.mobility,
      })
      setSettingsMessage('Карточка подопечного обновлена')
    } catch (error) {
      console.error('Error updating patient card from settings:', error)
      setSettingsError('Не удалось сохранить изменения карточки')
    } finally {
      setIsSavingCard(false)
    }
  }

  const handleSaveMetricsDraft = async () => {
    if (!canManageMetricsSettings || !id) return
    setSettingsError(null)

    const uniqueSelected = Array.from(new Set(metricsDraftSelected))
    if (uniqueSelected.length === 0) {
      setSettingsError('Выберите минимум один показатель')
      return
    }

    const normalizedPinned = metricsDraftPinned.filter(type => uniqueSelected.includes(type))
    if (normalizedPinned.length > 3) {
      setSettingsError('Можно закрепить не более трёх показателей')
      return
    }

    setMetricsDraftPinned(normalizedPinned)
    setMetricsDraftSelected(uniqueSelected)

    setIsSavingMetrics(true)
    try {
      // Загружаем существующие метрики из Supabase
      const { data: existingMetricsData, error: loadError } = await supabase
        .from('diary_metrics')
        .select('*')
        .eq('diary_id', id)

      if (loadError) {
        console.error('Ошибка загрузки метрик:', loadError)
        setSettingsError('Не удалось загрузить показатели')
        setIsSavingMetrics(false)
        return
      }

      const existingMap = new Map(metrics.map(metric => [metric.metric_type, metric]))
      const existingSupabaseMap = new Map(
        (existingMetricsData || []).map((m: any) => [m.metric_key, m])
      )

      // Определяем метрики для создания/обновления/удаления
      const metricsToUpsert: Array<{
        id?: string
        diary_id: string
        metric_key: string
        is_pinned: boolean
        metadata?: any
      }> = []

      // Обрабатываем закрепленные метрики
      normalizedPinned.forEach(type => {
        const existing = existingSupabaseMap.get(type)
        const existingLocal = existingMap.get(type)
        const settings = existingLocal?.settings || metricSettings[type]

        metricsToUpsert.push({
          id: existing?.id,
          diary_id: id,
          metric_key: type,
          is_pinned: true,
          metadata: settings ? { settings: normalizeSettings(settings) } : undefined,
        })
      })

      // Обрабатываем незакрепленные метрики
      uniqueSelected
        .filter(type => !normalizedPinned.includes(type))
        .forEach(type => {
          const existing = existingSupabaseMap.get(type)
          const existingLocal = existingMap.get(type)
          const settings = existingLocal?.settings || metricSettings[type]

          metricsToUpsert.push({
            id: existing?.id,
            diary_id: id,
            metric_key: type,
            is_pinned: false,
            metadata: settings ? { settings: normalizeSettings(settings) } : undefined,
          })
        })

      // Определяем метрики для удаления
      const removedTypes = metrics
        .map(metric => metric.metric_type)
        .filter(type => !uniqueSelected.includes(type))

      // Удаляем метрики из Supabase
      if (removedTypes.length > 0) {
        const { error: deleteError } = await supabase
          .from('diary_metrics')
          .delete()
          .eq('diary_id', id)
          .in('metric_key', removedTypes)

        if (deleteError) {
          console.error('Ошибка удаления метрик:', deleteError)
        }
      }

      // Создаем/обновляем метрики в Supabase
      const upsertPromises = metricsToUpsert.map(async (metric) => {
        if (metric.id) {
          // Обновляем существующую метрику
          const { error: updateError } = await supabase
            .from('diary_metrics')
            .update({
              is_pinned: metric.is_pinned,
              metadata: metric.metadata || {},
            })
            .eq('id', metric.id)

          if (updateError) {
            console.error('Ошибка обновления метрики:', updateError)
          }
        } else {
          // Создаем новую метрику
          const { error: insertError } = await supabase
            .from('diary_metrics')
            .insert({
              diary_id: metric.diary_id,
              metric_key: metric.metric_key,
              is_pinned: metric.is_pinned,
              metadata: metric.metadata || {},
            })

          if (insertError) {
            console.error('Ошибка создания метрики:', insertError)
          }
        }
      })

      await Promise.all(upsertPromises)

      // Обновляем локальное состояние
      const updatedMetricSettings = { ...metricSettings }
      removedTypes.forEach(type => {
          if (updatedMetricSettings[type]) {
            delete updatedMetricSettings[type]
          }
        })

      // Перезагружаем метрики из Supabase
      const { data: reloadedMetrics, error: reloadError } = await supabase
        .from('diary_metrics')
        .select('*')
        .eq('diary_id', id)

      if (!reloadError && reloadedMetrics) {
        const loadedMetrics = reloadedMetrics.map((m: any) => ({
          id: m.id,
          diary_id: m.diary_id,
          metric_type: m.metric_key,
          is_pinned: m.is_pinned,
          settings: m.metadata?.settings || undefined,
        }))
        setMetrics(loadedMetrics)

        // Обновляем настройки из метрик
        const loadedSettings: Record<string, MetricSettings> = {}
        loadedMetrics.forEach((metric: DiaryMetric) => {
          if (metric.settings) {
            loadedSettings[metric.metric_type] = normalizeSettings(metric.settings)
          }
        })
        setMetricSettings({ ...loadedSettings, ...updatedMetricSettings })
      } else {
        console.error('Ошибка перезагрузки метрик:', reloadError)
        alert('Не удалось обновить метрики. Попробуйте обновить страницу.')
      }

      setSettingsMessage('Показатели обновлены')
    } catch (error) {
      console.error('Error updating diary metrics from settings:', error)
      setSettingsError('Не удалось сохранить показатели')
    } finally {
      setIsSavingMetrics(false)
    }
  }

  // Определяем, является ли показатель булевым (было/не было)
  if (!diary || !patientCard) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">Загрузка...</p>
      </div>
    )
  }

  if (
    !assignmentsLoaded &&
    isOrgEmployee &&
    organizationType === 'patronage_agency'
  ) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">Загрузка доступа...</p>
      </div>
    )
  }

  if (!hasBaseAccess) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-sm px-6 py-8 text-center max-w-xs">
          <h2 className="text-lg font-bold text-gray-dark mb-2">Нет доступа</h2>
          <p className="text-sm text-gray-500">
            У вас нет прав для просмотра этого дневника. Обратитесь к владельцу для получения доступа.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
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
              Дневник здоровья
            </h1>
          </div>
          <span className="w-9 h-9" />
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex" role="tablist" aria-label="Разделы дневника">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`flex-1 py-3.5 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#55ACBF] ${
                activeTab === tab.id
                  ? 'text-gray-dark border-b-2 border-[#7DD3DC]'
                  : 'text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div
        className="px-4 py-6 max-w-md mx-auto pb-6"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {activeTab === 'diary' && (
          <div className="space-y-6">
            {/* Закрепленные показатели - отображаются только если были выбраны */}
            {pinnedMetrics.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-gray-dark mb-4">
                  Закрепленные показатели
                </h2>
                
                <div className="relative">
                  <div
                    className={`grid grid-cols-3 gap-3 transition-opacity duration-300 ${
                      panelVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
                    }`}
                    style={{
                      gap: isSmallScreen ? '8px' : '12px'
                    }}
                  >
                    {pinnedMetrics.map((metric, index) => {
                      const lastValue = getLastMetricValue(metric.metric_type)
                      const displayValue = lastValue || '--'
                      const isAnimatingCard = animatingPinnedMetric?.type === metric.metric_type

                      const translateValue = isAnimatingCard
                        ? animatingPinnedMetric!.direction === 'toPanel'
                          ? animatingPinnedMetric!.index === 1
                            ? 'calc(-100% - 12px)'
                            : animatingPinnedMetric!.index === 2
                            ? 'calc(-200% - 24px)'
                            : '0'
                          : animatingPinnedMetric!.direction === 'fromPanel'
                          ? animatingPinnedMetric!.index === 1
                            ? 'calc(-100% - 12px)'
                            : animatingPinnedMetric!.index === 2
                            ? 'calc(-200% - 24px)'
                            : '0'
                          : '0'
                        : '0'
                      const cardStyle: { [key: string]: string | number } = {
                        transform: `translate3d(${translateValue}, 0, 0)`,
                        transition: 'transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 240ms ease',
                        zIndex: isAnimatingCard ? 10 : 'auto',
                      }
                      if (animatingPinnedMetric && animatingPinnedMetric.type !== metric.metric_type) {
                        cardStyle.opacity = panelVisible ? 0 : 1
                      }

                      return (
                        <button
                          key={metric.id}
                          onClick={() => handlePinnedCardClick(metric, index)}
                          className={`bg-gradient-to-br from-[#61B4C6] to-[#317799] rounded-2xl text-white text-center shadow-md flex flex-col items-center w-full min-w-0 ${
                            !canFillMetrics ? 'opacity-60 cursor-not-allowed' : ''
                          }`}
                          style={{ 
                            fontFamily: 'Manrope, sans-serif', 
                            padding: isSmallScreen ? '8px' : '12px',
                            borderRadius: isSmallScreen ? '12px' : '16px',
                            ...cardStyle 
                          }}
                          disabled={
                            !canFillMetrics ||
                            (!!animatingPinnedMetric && animatingPinnedMetric.type !== metric.metric_type)
                          }
                        >
                          <div
                            className="text-base font-bold w-full text-center mb-2"
                            style={{
                              fontFamily: 'Manrope, sans-serif',
                              fontWeight: 700,
                              minHeight: isSmallScreen ? '32px' : '38px',
                              lineHeight: '1.1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: isSmallScreen ? '12px' : '16px',
                            }}
                          >
                            {getMetricLabel(metric.metric_type)}
                          </div>

                          <div className="flex items-center justify-center w-full" style={{ height: isSmallScreen ? '70px' : '90px' }}>
                            <div className="relative flex items-center justify-center" style={{ 
                              width: isSmallScreen ? '70px' : '90px', 
                              height: isSmallScreen ? '70px' : '90px', 
                              minWidth: isSmallScreen ? '70px' : '90px', 
                              minHeight: isSmallScreen ? '70px' : '90px' 
                            }}>
                              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 90 90" preserveAspectRatio="xMidYMid meet">
                                <circle
                                  cx="45"
                                  cy="45"
                                  r="38"
                                  fill="none"
                                  stroke="#4A4A4A"
                                  strokeWidth="3"
                                  strokeDasharray="4 4"
                                  opacity="0.9"
                                />
                              </svg>
                              <div
                                className="text-2xl font-bold relative z-10 text-center"
                                style={{ 
                                  fontFamily: 'Manrope, sans-serif', 
                                  fontWeight: 700,
                                  fontSize: isSmallScreen ? '18px' : '24px',
                                }}
                              >
                                {displayValue}
                              </div>
                            </div>
                          </div>

                          <div className="w-full space-y-1.5 mt-2">
                            <div
                              className="text-xs opacity-90 text-center"
                              style={{ 
                                fontFamily: 'Manrope, sans-serif', 
                                fontWeight: 400,
                                fontSize: isSmallScreen ? '10px' : '12px',
                              }}
                            >
                              {metricSettings[metric.metric_type]?.times?.length
                                ? `Заполнить через: ${getTimeUntilNext(metric.metric_type)}`
                                : 'Выберите время'}
                            </div>

                            <div
                              className="w-full text-xs text-white py-1.5 text-center"
                              style={{
                                fontFamily: 'Manrope, sans-serif',
                                fontWeight: 400,
                                backgroundColor: '#4A4A4A',
                                borderRadius: '12px',
                                fontSize: isSmallScreen ? '10px' : '12px',
                                paddingTop: isSmallScreen ? '4px' : '6px',
                                paddingBottom: isSmallScreen ? '4px' : '6px',
                              }}
                            >
                              Заполнить
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {panelMetric && (
                    <div
                      className={`absolute inset-0 w-full h-full origin-left transition-transform duration-[600ms] cubic-bezier(0.2, 0.8, 0.2, 1) shadow-lg ${
                        panelVisible ? 'scale-x-100' : 'scale-x-0'
                      }`}
                      style={{
                        transformOrigin: 'left center',
                        zIndex: 20,
                      }}
                    >
                      <PinnedMetricPanel
                        key={panelMetric}
                        metricType={panelMetric}
                        metricLabel={getMetricLabel(panelMetric)}
                        lastValue={getLastMetricValue(panelMetric)}
                        onSave={handleSaveMetric}
                        onClose={closePanel}
                        initialTimes={metricSettings[panelMetric]?.times}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Показания по расписанию (timeline) */}
            {/* {scheduledItemsForDate && scheduledItemsForDate.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm mb-4 overflow-hidden p-4">
                <h2 className="text-xl font-bold text-gray-dark mb-3 text-center">Манипуляции на сегодня</h2>
                <div className="max-w-md mx-auto">
                  <div className="border rounded-lg overflow-hidden">
                    {Array.from({ length: 14 }).map((_, idx) => {
                      const hour = 7 + idx // 07..20
                      const items = scheduledItemsForDate.filter(it => Math.floor(it.startMinutes / 60) === hour)
                      return (
                        <div key={hour} className="flex items-start gap-3 py-2 px-3 border-b last:border-b-0">
                          <div className="w-16 text-sm text-gray-500">{String(hour).padStart(2, '0')}:00</div>
                          <div className="flex-1 min-h-[40px]">
                            {items.length === 0 ? (
                              <div className="text-xs text-gray-300">&nbsp;</div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {items.map(it => (
                                  <div key={`${it.metric}_${it.from}`} className="inline-flex items-center justify-between bg-[#CFF6F8] text-[#0A6D83] rounded-md px-3 py-2 shadow-sm">
                                    <div className="flex flex-col">
                                      <div className="text-sm font-semibold">{it.label}</div>
                                      <div className="text-xs text-[#0A6D83] opacity-80">{it.from}{it.from !== it.to ? ` — ${it.to}` : ''}</div>
                                    </div>
                                    <button onClick={() => handleRegularMetricClick(it.metric)} className="ml-3 text-xs text-white bg-[#2AA6B1] rounded-md px-2 py-1">Заполнить</button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )} */}

            {/* Все показатели */}
            <div className="mt-8">
              <h2 className="text-xl font-bold text-gray-dark mb-4">
                Все показатели
              </h2>

              {/* Показатели ухода */}
              {careMetrics.length > 0 && (
                <div className="bg-white rounded-3xl shadow-sm mb-4 overflow-hidden">
                  <button
                    onClick={() => toggleSection('care')}
                    className="w-full px-6 py-5 flex flex-col items-center justify-center"
                  >
                    <h3 className="text-xl font-bold text-gray-dark text-center mb-2">
                      Показатели ухода
                    </h3>
                    <p className="text-sm text-gray-500 text-center mb-3">
                      Прогулка, когнитивные игры, гигиена, сон и т.д.
                    </p>
                    <img
                      src="/icons/иконка маленькая стрелка.png"
                      alt="Раскрыть"
                      className={`w-4 h-4 transition-transform ${
                        expandedSections.care ? '-rotate-90' : 'rotate-90'
                      }`}
                    />
                  </button>
                  {expandedSections.care && (
                    <div className="px-5 pb-5 pt-1 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        {careMetrics.map(metric => (
                          <button
                            key={metric.id}
                            onClick={() => handleRegularMetricClick(metric.metric_type)}
                            disabled={!canFillMetrics}
                            className={`py-3 px-4 border-2 border-[#7DD3DC] text-gray-dark rounded-2xl font-medium text-sm transition-colors ${
                              canFillMetrics
                                ? 'hover:bg-[#7DD3DC] hover:text-white'
                                : 'opacity-60 cursor-not-allowed'
                            }`}
                          >
                            {getMetricLabel(metric.metric_type)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Физические показатели */}
              {physicalMetrics.length > 0 && (
                <div className="bg-white rounded-3xl shadow-sm mb-4 overflow-hidden">
                  <button
                    onClick={() => toggleSection('physical')}
                    className="w-full px-6 py-5 flex flex-col items-center justify-center"
                  >
                    <h3 className="text-xl font-bold text-gray-dark text-center mb-2">
                      Физические показатели
                    </h3>
                    <p className="text-sm text-gray-500 text-center mb-3">
                      Температура, давление, сатурация и т.д.
                    </p>
                    <img
                      src="/icons/иконка маленькая стрелка.png"
                      alt="Раскрыть"
                      className={`w-4 h-4 transition-transform ${
                        expandedSections.physical ? '-rotate-90' : 'rotate-90'
                      }`}
                    />
                  </button>
                  {expandedSections.physical && (
                    <div className="px-5 pb-5 pt-1 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        {physicalMetrics.map(metric => (
                          <button
                            key={metric.id}
                            onClick={() => handleRegularMetricClick(metric.metric_type)}
                            disabled={!canFillMetrics}
                            className={`py-3 px-4 border-2 border-[#7DD3DC] text-gray-dark rounded-2xl font-medium text-sm transition-colors ${
                              canFillMetrics
                                ? 'hover:bg-[#7DD3DC] hover:text-white'
                                : 'opacity-60 cursor-not-allowed'
                            }`}
                          >
                            {getMetricLabel(metric.metric_type)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Выделение мочи и кала */}
              {excretionMetrics.length > 0 && (
                <div className="bg-white rounded-3xl shadow-sm mb-4 overflow-hidden">
                  <button
                    onClick={() => toggleSection('excretion')}
                    className="w-full px-6 py-5 flex flex-col items-center justify-center"
                  >
                    <h3 className="text-xl font-bold text-gray-dark text-center mb-2">
                      Выделение мочи и кала
                    </h3>
                    <p className="text-sm text-gray-500 text-center mb-3">
                      Выпито/выделено, цвет мочи и дефекация
                    </p>
                    <img
                      src="/icons/иконка маленькая стрелка.png"
                      alt="Раскрыть"
                      className={`w-4 h-4 transition-transform ${
                        expandedSections.excretion ? '-rotate-90' : 'rotate-90'
                      }`}
                    />
                  </button>
                  {expandedSections.excretion && (
                    <div className="px-5 pb-5 pt-1 border-t border-gray-100">
                      <div className="grid grid-cols-1 gap-3 mt-4">
                        {excretionMetrics.map(metric => (
                          <button
                            key={metric.id}
                            onClick={() => handleRegularMetricClick(metric.metric_type)}
                            disabled={!canFillMetrics}
                            className={`py-3 px-4 border-2 border-[#7DD3DC] text-gray-dark rounded-2xl font-medium text-sm transition-colors ${
                              canFillMetrics
                                ? 'hover:bg-[#7DD3DC] hover:text-white'
                                : 'opacity-60 cursor-not-allowed'
                            }`}
                          >
                            {getMetricLabel(metric.metric_type)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Тягостные симптомы */}
              {symptomMetrics.length > 0 && (
                <div className="bg-white rounded-3xl shadow-sm mb-4 overflow-hidden">
                  <button
                    onClick={() => toggleSection('symptoms')}
                    className="w-full px-6 py-5 flex flex-col items-center justify-center"
                  >
                    <h3 className="text-xl font-bold text-gray-dark text-center mb-2">
                      Тягостные симптомы
                    </h3>
                    <p className="text-sm text-gray-500 text-center mb-3">
                      Рвота, тошнота, зуд, кашель, одышка и т.д.
                    </p>
                    <img
                      src="/icons/иконка маленькая стрелка.png"
                      alt="Раскрыть"
                      className={`w-4 h-4 transition-transform ${
                        expandedSections.symptoms ? '-rotate-90' : 'rotate-90'
                      }`}
                    />
                  </button>
                  {expandedSections.symptoms && (
                    <div className="px-5 pb-5 pt-1 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        {symptomMetrics.map(metric => (
                          <button
                            key={metric.id}
                            onClick={() => handleRegularMetricClick(metric.metric_type)}
                            disabled={!canFillMetrics}
                            className={`py-3 px-4 border-2 border-[#7DD3DC] text-gray-dark rounded-2xl font-medium text-sm transition-colors ${
                              canFillMetrics
                                ? 'hover:bg-[#7DD3DC] hover:text-white'
                                : 'opacity-60 cursor-not-allowed'
                            }`}
                          >
                            {getMetricLabel(metric.metric_type)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Кнопки внизу страницы */}
            <div className="mt-6 space-y-3">
              {/* Изменить показатели (для владельцев, организаций и администраторов/руководителей) */}
              {canManageMetricsSettings && (
                <button
                  onClick={() => navigate(`/diaries/${id}/edit-metrics`)}
                  className="w-full bg-white rounded-3xl shadow-sm px-5 py-3 text-center"
                >
                  <h3 className="text-base font-bold text-[#7DD3DC]">
                    Изменить показатели
                  </h3>
                </button>
              )}

              {/* Управление доступом (для владельцев, организаций, руководителей и администраторов) */}
              {canManageAccessSettings && (
              <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleSection('accessManagement')}
                  className="w-full px-4 py-2 flex flex-col items-center justify-center"
                >
                  <h3 className="text-sm font-bold text-red-600 text-center mb-1.5">
                    Управление доступом
                  </h3>
                  <img
                    src="/icons/иконка маленькая стрелка.png"
                    alt="Раскрыть"
                    className={`w-3 h-3 transition-transform ${
                      expandedSections.accessManagement ? '-rotate-90' : 'rotate-90'
                    }`}
                  />
                </button>
                {expandedSections.accessManagement && (
                  <div className="px-4 py-3 border-t border-gray-100 space-y-4">
                    {/* Секция для патронажных агентств - показываем если это патронажное агентство */}
                    {/* Доступ для организаций и руководителей/администраторов с правом управления доступом */}
                    {/* Для руководителей проверяем роль напрямую, не дожидаясь загрузки employeePermissions */}
                    {assignmentOrganizationType === 'patronage_agency' && (isOrganizationAccount || isOrgEmployee) && (
                      <div className="space-y-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-700 mb-2">
                                Добавить специалиста
                              </p>
                              {availableOrgEmployees.filter(
                                employee => !assignedEmployees.some(item => item.user_id === employee.user_id)
                              ).length === 0 ? (
                                <p className="text-xs text-gray-500">
                                  Все специалисты уже имеют доступ или отсутствуют в списке.
                                </p>
                              ) : (
                                <div className="flex gap-2">
                                  <select
                                    value={selectedEmployeeId}
                                    onChange={event => setSelectedEmployeeId(event.target.value)}
                                    className="flex-1 rounded-2xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#7DD3DC] bg-white"
                                  >
                                    <option value="">Выберите специалиста</option>
                                    {availableOrgEmployees
                                      .filter(
                                        employee => !assignedEmployees.some(item => item.user_id === employee.user_id)
                                      )
                                      .map(employee => (
                                        <option key={employee.user_id} value={employee.user_id}>
                                          {`${employee.first_name || ''} ${employee.last_name || ''}`.trim() ||
                                            employee.user_id}{' '}
                                          {employee.role ? `(${employee.role})` : ''}
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                onClick={() => handleAddEmployeeAccess()}
                                    disabled={!selectedEmployeeId}
                                    className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                                  >
                                    Добавить
                                  </button>
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-700 mb-2">
                                Специалисты с доступом:
                              </p>
                              {assignedEmployeesDisplay.length === 0 ? (
                                <p className="text-sm text-gray-500">Нет назначенных специалистов</p>
                              ) : (
                                <div className="space-y-2">
                                  {assignedEmployeesDisplay.map(employee => (
                                    <div
                                      key={employee.user_id}
                                      className="flex items-center justify-between py-2 border-b border-gray-100"
                                    >
                                      <div>
                                        <p className="text-sm text-gray-800">
                                          {`${employee.first_name || ''} ${employee.last_name || ''}`.trim() ||
                                            employee.user_id}
                                        </p>
                                        {employee.role && (
                                          <p className="text-xs text-gray-500">{employee.role}</p>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => handleRemoveEmployeeAccess(employee.user_id)}
                                        className="text-red-600 hover:text-red-700 text-lg"
                                        aria-label="Удалить доступ специалиста"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                      </div>
                    )}

                    {/* Секция для пансионатов */}
                    {/* Доступ для организаций и руководителей/администраторов с правом управления доступом */}
                    {/* Для руководителей проверяем роль напрямую, не дожидаясь загрузки employeePermissions */}
                    {assignmentOrganizationType === 'pension' && (isOrganizationAccount || isOrgEmployee) && availableOrgEmployees.length > 0 && (
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-2">
                            Добавить специалиста
                          </p>
                          {availableOrgEmployees.filter(
                            employee => !assignedEmployees.some(item => item.user_id === employee.user_id)
                          ).length === 0 ? (
                            <p className="text-xs text-gray-500">
                              Все специалисты уже имеют доступ или отсутствуют в списке.
                            </p>
                          ) : (
                            <div className="flex gap-2">
                              <select
                                value={selectedEmployeeId}
                                onChange={event => setSelectedEmployeeId(event.target.value)}
                                className="flex-1 rounded-2xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#7DD3DC] bg-white"
                              >
                                <option value="">Выберите специалиста</option>
                                {availableOrgEmployees
                                  .filter(
                                    employee => !assignedEmployees.some(item => item.user_id === employee.user_id)
                                  )
                                  .map(employee => (
                                    <option key={employee.user_id} value={employee.user_id}>
                                      {`${employee.first_name || ''} ${employee.last_name || ''}`.trim() ||
                                        employee.user_id}{' '}
                                      {employee.role ? `(${employee.role})` : ''}
                                    </option>
                                  ))}
                              </select>
                              <button
                                onClick={() => handleAddEmployeeAccess()}
                                disabled={!selectedEmployeeId}
                                className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                              >
                                Добавить
                              </button>
                            </div>
                          )}
                        </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-700 mb-2">
                              Сотрудники организации
                            </p>
                            <div className="space-y-2">
                            {availableOrgEmployees.map(employee => {
                              // Для пансионатов: все сотрудники имеют доступ по умолчанию
                              // "Нет доступа" только если есть запись с revoked_at
                              let hasAccess = true
                              if (assignmentOrganizationType === 'pension') {
                                // Проверяем, не отозван ли доступ явно
                                const revokedEmployee = assignedEmployees.find(
                                  (item: any) => item.user_id === employee.user_id && item.revoked_at
                                )
                                hasAccess = !revokedEmployee
                              } else {
                                // Для патронажных агентств: доступ только если явно назначен
                                hasAccess = assignedEmployeesDisplay.some(item => item.user_id === employee.user_id)
                              }
                              return (
                                <div
                                  key={`pension-${employee.user_id}`}
                                  className="flex items-center justify-between py-2 border-b border-gray-100"
                                >
                                  <div>
                                    <p className="text-sm text-gray-800">
                                      {`${employee.first_name || ''} ${employee.last_name || ''}`.trim() ||
                                        employee.user_id}
                                    </p>
                                    {employee.role && <p className="text-xs text-gray-500">{employee.role}</p>}
                                    {hasAccess && (
                                      <p className="text-xs text-green-600 mt-1">✓ Доступ предоставлен</p>
                                    )}
                                    {!hasAccess && (
                                      <p className="text-xs text-gray-400 mt-1">Нет доступа</p>
                                    )}
                                  </div>
                                  {hasAccess ? (
                                    <button
                                      onClick={() => handleRemoveEmployeeAccess(employee.user_id)}
                                      className="text-red-600 hover:text-red-700 text-lg"
                                      aria-label="Удалить доступ специалиста"
                                      title="Убрать доступ"
                                    >
                                      🗑️
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleAddEmployeeAccess(employee.user_id)}
                                      className="text-[#7DD3DC] hover:text-[#5CBCC7] text-lg"
                                      aria-label="Добавить доступ специалиста"
                                      title="Добавить доступ"
                                    >
                                      ➕
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                            </div>
                          <p className="text-xs text-gray-500 mt-2">
                            Вы можете добавлять и убирать доступ у сотрудников пансионата.
                            </p>
                          </div>
                      </div>
                    )}


                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-gray-700">
                        Текущий доступ
                      </p>
                      {organizationAccountAccess && (
                        <div className="py-2 border-b border-gray-100">
                          <p className="text-sm text-gray-800">Организация (этот аккаунт)</p>
                          <p className="text-xs text-gray-500">
                            {diary?.organization_id ? `ID: ${diary.organization_id}` : 'ID не указан'}
                          </p>
                        </div>
                      )}
                      {organizationEmployeeAccess && !organizationAccountAccess && (
                        <div className="py-2 border-b border-gray-100">
                          <p className="text-sm text-gray-800">Сотрудник организации</p>
                          <p className="text-xs text-gray-500">
                            Доступ предоставлен организацией (ID: {diary?.organization_id || '—'})
                          </p>
                        </div>
                      )}
                      {/* ВАЖНО: Для патронажных агентств сотрудники уже отображаются в разделе "Специалисты с доступом:" выше,
                          поэтому здесь их не показываем, чтобы избежать дублирования */}
                      {assignmentOrganizationType === 'patronage_agency' &&
                        organizationAccountAccess &&
                        assignedEmployeesDisplay.length === 0 && (
                        <p className="text-xs text-gray-500">
                          Нет назначенных специалистов
                        </p>
                      )}
                      {assignmentOrganizationType === 'pension' &&
                        organizationAccountAccess &&
                        availableOrgEmployees.length === 0 && (
                          <p className="text-xs text-gray-500">
                            Все сотрудники пансионата имеют доступ к дневнику автоматически.
                          </p>
                        )}
                      {diary?.caregiver_id && (
                        <div className="flex items-center justify-between py-2 border-b border-gray-100">
                          <div>
                            <p className="text-sm text-gray-800">Частная сиделка</p>
                            <p className="text-xs text-gray-500">ID: {diary.caregiver_id}</p>
                          </div>
                          {canManageAccessSettings && (
                            <button
                              onClick={() => handleRemoveAccess('caregiver')}
                              className="text-red-600 hover:text-red-700 text-lg"
                              aria-label="Удалить доступ сиделки"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      )}
                      {diary?.organization_id && canManageAccessSettings && (
                          <div className="flex items-center justify-between py-2 border-b border-gray-100">
                            <div>
                            <p className="text-sm text-gray-800">
                              {organizationInfo?.name || 'Организация'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {organizationInfo?.type === 'patronage_agency' 
                                ? 'Патронажное агентство' 
                                : organizationInfo?.type === 'pension'
                                ? 'Пансионат'
                                : 'Организация'}
                              {organizationInfo?.id && ` (ID: ${organizationInfo.id})`}
                            </p>
                            </div>
                            <button
                              onClick={() => handleRemoveAccess('organization')}
                              className="text-red-600 hover:text-red-700 text-lg"
                              aria-label="Удалить доступ организации"
                            title="Отвязать дневник от организации"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      {!diary?.organization_id &&
                        !diary?.caregiver_id &&
                        (organizationType !== 'patronage_agency' || assignedEmployeesDisplay.length === 0) && (
                          <p className="text-sm text-gray-500 text-center">
                            Нет активных доступов
                          </p>
                        )}
                      {!canManageAccessSettings && !organizationAccountAccess && !organizationEmployeeAccess && (
                        <p className="text-xs text-gray-500 text-center">
                          У вас нет прав для изменения доступа
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="relative" ref={calendarRef}>
              <div className="bg-white rounded-[32px] shadow-[0_14px_35px_rgba(9,109,131,0.08)] px-6 py-6 text-center space-y-3">
                <p className="text-xs text-[#4A4A4A] uppercase tracking-wide">
                  Нажмите, чтобы выбрать дату истории заполнения
                </p>
                <button
                  onClick={() => setIsCalendarOpen(prev => !prev)}
                  className="w-full"
                  aria-label="Выбрать дату"
                >
                  <div className="relative bg-gradient-to-b from-[#F6FEFF] via-[#F0FBFD] to-[#E6F8FA] border border-[#C5EEF2] rounded-[28px] px-5 py-4 shadow-[0_12px_30px_rgba(9,109,131,0.08)]">
                    <p className="text-[20px] font-semibold text-[#0A6D83]">
                      {selectedDateLabel}
                    </p>
                    <p className="text-xs text-[#7BA0A6] mt-1">Отчёт будет построен за этот день</p>
                  </div>
                </button>
              </div>

              {isCalendarOpen && (
                <div className="absolute left-0 right-0 mt-4 z-30">
                  <div className="bg-white rounded-[32px] shadow-[0_26px_45px_rgba(9,109,131,0.18)] px-6 py-6">
                    <div className="flex items-center justify-between mb-4">
                      <button
                        onClick={() =>
                          setCalendarMonth(
                            new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                          )
                        }
                        className="p-2 rounded-full bg-[#F3FBFD] text-[#0A6D83] hover:bg-[#E8F7FA] transition"
                        aria-label="Предыдущий месяц"
                      >
                        ‹
                      </button>
                      <div className="text-[#0A6D83] font-semibold text-base">{calendarMonthLabel}</div>
                      <button
                        onClick={() =>
                          setCalendarMonth(
                            new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                          )
                        }
                        className="p-2 rounded-full bg-[#F3FBFD] text-[#0A6D83] hover:bg-[#E8F7FA] transition"
                        aria-label="Следующий месяц"
                      >
                        ›
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-xs font-semibold text-[#7BA0A6] mb-3">
                      {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(weekday => (
                        <div key={weekday} className="text-center uppercase tracking-wide">
                          {weekday}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {calendarDays.map(day => (
                        <button
                          key={`${day.key}-${day.label}`}
                          onClick={() => {
                            setSelectedDate(day.key)
                            setCalendarMonth(new Date(day.date.getFullYear(), day.date.getMonth(), 1))
                            setIsCalendarOpen(false)
                          }}
                          className={`h-10 w-10 rounded-full flex items-center justify-center text-sm transition ${
                            day.isSelected
                              ? 'bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white shadow-md'
                              : day.isCurrentMonth
                              ? 'text-[#0A6D83]'
                              : 'text-[#B6C9CD]'
                          } ${day.isToday && !day.isSelected ? 'border border-[#7DD3DC]' : ''}`}
                          aria-label={`Выбрать ${day.key}`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-center mt-4">
                      <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-l-transparent border-r-transparent border-t-white"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-[#E8F9FB] rounded-[32px] px-5 py-6 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-[#4A4A4A] mb-3">
                  Принятые лекарства и витамины
                </h3>
                <div className="bg-white/85 rounded-[24px] px-4 py-4 space-y-2">
                  {medicationEntries.length > 0 ? (
                    medicationEntries.map(group => (
                      <div key={group.metricType} className="space-y-2">
                        <p className="text-xs font-semibold text-[#0A6D83] uppercase tracking-wide pl-1">
                          {group.label}
                        </p>
                        {group.items.map((item, idx) => (
                          <div
                            key={item.uniqueKey || `${item.id}_${item.metric_type}_${item.created_at}_${idx}`}
                            className="bg-white border border-[#7DD3DC] rounded-full px-4 py-2 text-sm text-[#4A4A4A] flex items-center justify-between gap-3"
                          >
                            <span className="flex-1 whitespace-normal break-words leading-tight">
                              {item.displayValue && item.displayValue !== '--'
                                ? item.displayValue
                                : item.label}
                            </span>
                            <span className="text-xs text-[#0A6D83] font-semibold whitespace-nowrap self-center">
                              {item.time}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#7BA0A6] text-center">Нет записей за эту дату</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-[#4A4A4A] mb-3">Отчёт за сегодня</h3>
                <div className="bg-white/85 rounded-[24px] px-4 py-4 space-y-2">
                  {otherHistoryEntries.length > 0 ? (
                    otherHistoryEntries.map(group => (
                      <div key={group.metricType} className="space-y-2">
                        <p className="text-xs font-semibold text-[#0A6D83] uppercase tracking-wide pl-1">
                          {group.label}
                        </p>
                        {group.items.map((item, idx) => (
                          <div
                            key={item.uniqueKey || `${item.id}_${item.metric_type}_${item.created_at}_${idx}`}
                            className="bg-white border border-[#7DD3DC] rounded-full px-4 py-2 text-sm text-[#4A4A4A] flex items-center justify-between gap-3"
                          >
                            <span className="flex-1 whitespace-normal break-words leading-tight">
                              {item.displayValue && item.displayValue !== '--'
                                ? item.displayValue
                                : ''}
                            </span>
                            <span className="text-xs text-[#0A6D83] font-semibold whitespace-nowrap self-center">
                              {item.time}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#7BA0A6] text-center">Нет записей за эту дату</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'route' && (
          <div className="space-y-6">
            {/* Информационная карточка */}
            <div className="bg-white rounded-[20px] shadow-[0_12px_30px_rgba(9,109,131,0.06)] px-6 py-5">
              <p className="text-sm text-[#4A4A4A] leading-relaxed">
                Маршрутный лист показывает, какие манипуляции нужно выполнять с подопечным, когда и с какой периодичностью
                (ежедневно, раз в неделю). Можно составить вручную или воспользоваться ИИ, который предложит готовый вариант
                на основе дневника динамики ухода. С маршрутным листом легко согласовать, изменить и отслеживать выполнение всех процедур.
              </p>
            </div>

            {/* Заголовок секции */}
            <h2 className="text-2xl font-bold text-gray-dark">Настроить маршрутный лист</h2>

            {/* Панель добавления маршрутов */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <p className="text-base text-gray-700 mb-6">Добавьте манипуляции вручную или с помощью ИИ</p>

              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsRoutePickerOpen(true)}
                  className="px-6 py-2 rounded-full bg-[#4A4A4A] text-white text-sm font-semibold shadow-sm hover:opacity-90"
                >
                  Добавить
                </button>

                <button
                  type="button"
                  onClick={() => setIsRoutePickerOpen(true)}
                  className="px-6 py-2 rounded-full bg-gradient-to-r from-[#0A6D83] to-[#2A9DB0] text-white text-sm font-semibold shadow-sm hover:opacity-90"
                >
                  Добавить с ИИ
                </button>
              </div>
            </div>
          </div>
        )}

        {isRoutePickerOpen && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setIsRoutePickerOpen(false)}
            />

            {/* Bottom sheet container */}
            <div className="absolute left-0 right-0 bottom-0 mx-auto w-full max-w-3xl">
              <div className="bg-white rounded-t-3xl shadow-lg p-4 pb-6 max-h-[80vh] overflow-auto transform transition-transform duration-200 ease-out">
                {/* drag handle */}
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3" />

                <div className="flex items-center justify-center mb-2 text-center relative">
                  <h3 className="text-3xl font-black text-[#25ADB8]">Выбор манипуляций</h3>
                  <button
                    onClick={() => setIsRoutePickerOpen(false)}
                    aria-label="Закрыть"
                    className="text-2xl absolute right-0"
                  >
                    ×
                  </button>
                </div>

                <p className="text-sm text-gray-600 mb-4 text-center border-t border-gray-100 pt-4">Чтобы выбрать манипуляции, которые необходимо выполнять специалисту, выберите их, укажите дни, по которым нужно проводить а также порядок выполнения.</p>

                <h3 className="text-2xl font-black text-[#4A4A4A] text-center mb-5">Манипуляции ухода</h3>

                <div className="grid grid-cols-2 gap-3">
                  {careMetricOptionsState.map(o => (
                    <div key={o.value} className="relative">
                      <button
                        onClick={() => toggleManipulation(o.value)}
                        className={`w-full py-3 px-4 rounded-xl shadow-sm border border-[#25ACB7] text-sm font-medium text-center ${selectedManipulations.includes(o.value) ? 'bg-[#CFF6F8] border-[#0A6D83]' : 'bg-white border-gray-200'}`}
                      >
                        {o.label}
                      </button>
                      {!originalCareMetricValuesRef.current.has(o.value) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeCareOption(o.value) }}
                          aria-label={`Удалить ${o.label}`}
                          className="absolute top-1 right-1 text-xs text-red-500 bg-white rounded-full w-6 h-6 flex items-center justify-center shadow-sm"
                          title="Удалить"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-6 w-full flex items-center gap-3">
                  <input
                    value={customMetricInput}
                    onChange={e => setCustomMetricInput(e.target.value)}
                    onKeyDown={handleCustomInputKeyDown}
                    className="flex-1 rounded-xl border border-gray-200 px-6 py-2.5 text-lg text-gray-700 bg-white shadow-inner"
                    placeholder="Добавить показатель"
                    aria-label="Добавить показатель"
                  />
                  <button
                    onClick={handleAddCustomMetric}
                    disabled={!customMetricInput.trim()}
                    className={`w-12 h-12 rounded-xl text-white flex items-center justify-center ${customMetricInput.trim() ? 'bg-[#2AA6B1]' : 'bg-gray-300 cursor-not-allowed'} shadow-md`}
                    aria-label="Добавить"
                  >
                    +
                  </button>
                </div>

                <div className="mt-6">
                  <h3 className="text-2xl font-black text-[#4A4A4A] text-center mb-5">Физические манипуляции</h3>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {physicalMetricOptionsState.map(o => (
                      <div key={o.value} className="relative">
                        <button
                          onClick={() => toggleManipulation(o.value)}
                          className={`w-full py-3 px-4 rounded-xl shadow-sm border border-[#25ACB7] text-sm font-medium text-center ${selectedManipulations.includes(o.value) ? 'bg-[#CFF6F8] border-[#0A6D83]' : 'bg-white border-gray-200'}`}
                        >
                          {o.label}
                        </button>
                        {!originalPhysicalMetricValuesRef.current.has(o.value) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removePhysicalOption(o.value) }}
                            aria-label={`Удалить ${o.label}`}
                            className="absolute top-1 right-1 text-xs text-red-500 bg-white rounded-full w-6 h-6 flex items-center justify-center shadow-sm"
                            title="Удалить"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 w-full flex items-center gap-3">
                    <input
                      value={customPhysicalInput}
                      onChange={e => setCustomPhysicalInput(e.target.value)}
                      onKeyDown={handlePhysicalInputKeyDown}
                      className="flex-1 rounded-xl border border-gray-200 px-6 py-2.5 text-lg text-gray-700 bg-white shadow-inner"
                      placeholder="Добавить показатель"
                      aria-label="Добавить показатель"
                    />
                    <button
                      onClick={handleAddPhysicalMetric}
                      disabled={!customPhysicalInput.trim()}
                      className={`w-12 h-12 rounded-xl text-white flex items-center justify-center ${customPhysicalInput.trim() ? 'bg-[#2AA6B1]' : 'bg-gray-300 cursor-not-allowed'} shadow-md`}
                      aria-label="Добавить"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex justify-center">
                    <button
                        onClick={() => {
                        if (!selectedManipulations || selectedManipulations.length === 0) {
                          alert('Выберите манипуляцию')
                          return
                        }
                        // Open modal for all selected manipulations
                        setManipulationToConfigure([...selectedManipulations])
                        setIsRoutePickerOpen(false)
                        setIsRouteManipulationConfigOpen(true)
                      }}
                      className="px-20 py-4 rounded-2xl bg-[#55ACBF] text-white"
                    >
                      Выбрать
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'client' && (isOrganization || (isOrgEmployee && employeePermissions.canManageClientAccess)) && (
          <div className="space-y-5">
            {!organizationClientLink?.accepted_by && (
            <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3">
              <h3 className="text-lg font-semibold text-gray-dark text-center">
                Поделитесь дневником с клиентом
              </h3>
              <p className="text-sm text-gray-600 text-center">
                Отправьте ссылку клиенту, чтобы он получил доступ к карточке подопечного и
                дневнику. Ссылка сохранится в его личном кабинете.
              </p>
            </div>
            )}

            {/* Список приглашенных клиентов */}
            {(invitedClients.length > 0 || organizationClientLink) && (
              <div className="bg-white rounded-3xl shadow-sm p-5 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Приглашенные клиенты
                </h3>
                {invitedClients.length === 0 && organizationClientLink && (
                  <p className="text-xs text-gray-500 mb-3">
                    Есть активная ссылка, но список приглашений пуст. Создайте новую ссылку для приглашения клиента.
                  </p>
                )}
                {invitedClients.length > 0 && (
                <div className="space-y-2">
                  {invitedClients.map((client) => {
                    // Клиент зарегистрирован, если есть accepted_at (из diary_client_links) 
                    // ИЛИ used_at (из invite_tokens) - это означает, что приглашение было использовано
                    // Также проверяем accepted_by или used_by - это user_id зарегистрированного клиента
                    const isRegistered = !!(client.accepted_at || client.used_at) && !!(client.accepted_by || client.used_by || client.client_id)
                    const clientName = client.registered_client_name || client.invited_client_name || 'Клиент'
                    const clientPhone = client.registered_client_phone || client.invited_client_phone || null
                    // Используем accepted_at если есть, иначе used_at
                    const registrationDate = client.accepted_at || client.used_at
                    
                    console.log('[DiaryPage] Статус клиента:', {
                      token: client.token,
                      isRegistered,
                      accepted_at: client.accepted_at,
                      used_at: client.used_at,
                      accepted_by: client.accepted_by,
                      used_by: client.used_by,
                      client_id: client.client_id,
                      registrationDate,
                      clientName,
                    })
                    
                    return (
                      <div
                        key={client.invite_id}
                        className="flex items-center justify-between py-3 px-3 border border-gray-100 rounded-2xl bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold text-gray-800">
                              {clientName}
                            </p>
                            {isRegistered && (
                              <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5">
                                ✓ Зарегистрирован
                              </span>
                            )}
                            {!isRegistered && client.used_at && (
                              <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5">
                                ⚠ Использован
                              </span>
                            )}
                            {!isRegistered && !client.used_at && (
                              <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5">
                                Ожидает
                              </span>
                            )}
                          </div>
                          {clientPhone && (
                            <p className="text-xs text-gray-500 mb-1">{clientPhone}</p>
                          )}
                          {isRegistered && registrationDate && (
                            <p className="text-xs text-gray-400">
                              Подключен {new Date(registrationDate).toLocaleDateString('ru-RU', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          )}
                          {!isRegistered && client.created_at && (
                            <p className="text-xs text-gray-400">
                              Приглашение отправлено {new Date(client.created_at).toLocaleDateString('ru-RU', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
            )}

            {organizationClientLink ? (
              <div className="bg-white rounded-3xl shadow-sm p-5 space-y-3">
                <div className="text-xs text-gray-400">
                  Ссылка создана{' '}
                  {new Date(organizationClientLink.created_at).toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
                {organizationClientLink.accepted_by ? (
                  <div className="text-xs text-green-600">
                    Клиент подключил дневник{' '}
                    {organizationClientLink.accepted_at
                      ? new Date(organizationClientLink.accepted_at).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </div>
                ) : (
                  <div className="text-xs text-[#7BA0A6]">
                    После перехода по ссылке дневник привяжется к аккаунту клиента, и он сможет
                    управлять доступом.
                  </div>
                )}
                {!organizationClientLink.accepted_by && (
                <div className="bg-gray-100 rounded-2xl px-3 py-2 text-sm text-gray-700 break-all">
                  {organizationClientLink.link}
                </div>
                )}
                {organizationClientLink.accepted_by && attachedClient ? (
                  <div className="border border-gray-100 rounded-2xl px-4 py-3 space-y-3 bg-[#F8FEFF]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {`${attachedClient.first_name || ''} ${attachedClient.last_name || ''}`.trim() ||
                            'Клиент'}
                        </p>
                        {attachedClient.phone && (
                          <p className="text-xs text-gray-500">{attachedClient.phone}</p>
                        )}
                      </div>
                      <span className="inline-flex items-center rounded-full bg-[#E3F6F8] text-[#0A6D83] text-xs font-semibold px-3 py-1">
                        Клиент подключен
                      </span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">
                        Скопируйте ссылку, чтобы клиент мог быстро войти в свой аккаунт.
                      </p>
                      <div className="bg-white rounded-2xl px-3 py-2 text-sm text-gray-700 break-all border border-[#CDEBF0]">
                        {`${appOrigin}/login?client_id=${attachedClient.user_id}`}
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          onClick={() =>
                            handleCopyLink(`${appOrigin}/login?client_id=${attachedClient.user_id}`)
                          }
                          fullWidth
                        >
                          Скопировать ссылку входа
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            openWhatsApp(
                              `${appOrigin}/login?client_id=${attachedClient.user_id}`,
                              'Здравствуйте! Вот ссылка для входа в ваш дневник:'
                            )
                          }
                          fullWidth
                        >
                          Отправить в WhatsApp
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {!organizationClientLink.accepted_by && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => handleCopyLink(organizationClientLink.link)} fullWidth>
                    Скопировать ссылку
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      openWhatsApp(
                        organizationClientLink.link,
                        'Здравствуйте! Мы подготовили доступ к дневнику вашего близкого. Перейдите по ссылке:'
                      )
                    }
                    fullWidth
                  >
                    Отправить в WhatsApp
                  </Button>
                </div>
                )}
                <p className="text-xs text-gray-400">
                  При необходимости вы можете сгенерировать новую ссылку — старая станет
                  недействительной.
                </p>
                <Button
                  variant="secondary"
                  onClick={handleCreateOrganizationLink}
                  className="w-full"
                >
                  Создать новую ссылку
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-sm p-6 text-center space-y-4">
                <p className="text-sm text-gray-600">
                  Пока ссылка не создана. Нажмите кнопку ниже, чтобы сформировать персональную
                  ссылку для клиента.
                </p>
                <Button onClick={handleCreateOrganizationLink}>Создать ссылку</Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'share' && isClient && (
          <div className="space-y-5">
            <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3">
              <h3 className="text-lg font-semibold text-gray-dark text-center">
                Поделитесь доступом к дневнику
              </h3>
              <p className="text-sm text-gray-600 text-center leading-relaxed">
                Отправьте ссылку сиделке или доверенному человеку, чтобы они могли заполнять и
                просматривать дневник. После перехода по ссылке дневник появится у них в списке, пока
                вы не отмените доступ.
              </p>
            </div>

            <div className="bg-white rounded-3xl shadow-sm p-5 space-y-4">
              <Button onClick={handleCreateExternalLink} fullWidth>
                Создать ссылку для сиделки
              </Button>
              {externalAccessLinks.length === 0 ? (
                <p className="text-sm text-gray-500 text-center">
                  Активных ссылок пока нет — создайте первую, чтобы поделиться доступом с сиделкой.
                </p>
              ) : (
                <div className="space-y-4">
                  {externalAccessLinks
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    )
                    .map(link => (
                      <div
                        key={link.id}
                        className="border border-gray-100 rounded-2xl px-4 py-3 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            Создано{' '}
                            {new Date(link.created_at).toLocaleDateString('ru-RU', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                          <button
                            onClick={() => handleRevokeExternalLink(link.id)}
                            className="text-sm text-red-500 hover:text-red-600"
                          >
                            Отменить доступ
                          </button>
                        </div>
                        <div className="bg-gray-100 rounded-2xl px-3 py-2 text-sm text-gray-700 break-all">
                          {link.link}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button onClick={() => handleCopyLink(link.link || '')} fullWidth>
                            Скопировать
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              openWhatsApp(
                                link.link || '',
                                'Я делюсь доступом к дневнику подопечного. Перейдите по ссылке:'
                              )
                            }
                            fullWidth
                          >
                            Отправить в WhatsApp
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={handleSettingsClose}></div>
          <div className="relative w-full max-w-md bg-white rounded-t-[32px] px-5 pt-6 pb-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-dark">Настройки дневника</h2>
              <button
                onClick={handleSettingsClose}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 text-gray-600"
                aria-label="Закрыть окно настроек"
                type="button"
              >
                ✕
              </button>
            </div>

            {availableSettingsSections.length > 1 && (
              <div className="flex gap-2 mt-5">
                {availableSettingsSections.map(section => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setSettingsSection(section.id)
                      setSettingsError(null)
                      setSettingsMessage(null)
                    }}
                    type="button"
                    className={`flex-1 rounded-2xl py-2 text-sm font-semibold transition-colors ${
                      settingsSection === section.id
                        ? 'bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white shadow-md'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            )}

            {settingsMessage && (
              <div className="mt-4 rounded-2xl bg-[#E6F7F9] text-[#0A6D83] text-sm px-4 py-3">
                {settingsMessage}
              </div>
            )}

            {settingsError && (
              <div className="mt-4 rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3">
                {settingsError}
              </div>
            )}

            {settingsSection === 'card' && (
              <div className="mt-5 space-y-4">
                {!canEditCardSettings && (
                  <p className="text-sm text-gray-500">
                    Только владелец дневника может редактировать карточку подопечного.
                  </p>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-xs uppercase tracking-wide text-gray-500">ФИО</label>
                    <Input
                      value={cardDraft.fullName}
                      onChange={event => setCardDraft(prev => ({ ...prev, fullName: event.target.value }))}
                      disabled={!canEditCardSettings || isSavingCard}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-gray-500">Дата рождения</label>
                    <Input
                      type="date"
                      value={cardDraft.dateOfBirth}
                      onChange={event => setCardDraft(prev => ({ ...prev, dateOfBirth: event.target.value }))}
                      disabled={!canEditCardSettings || isSavingCard}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-gray-500">Адрес</label>
                    <Input
                      value={cardDraft.address}
                      onChange={event => setCardDraft(prev => ({ ...prev, address: event.target.value }))}
                      disabled={!canEditCardSettings || isSavingCard}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-gray-500">Диагнозы</label>
                    <textarea
                      value={cardDraft.diagnoses}
                      onChange={event => setCardDraft(prev => ({ ...prev, diagnoses: event.target.value }))}
                      disabled={!canEditCardSettings || isSavingCard}
                      placeholder="Перечислите через запятую"
                      className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-[#7DD3DC] focus:outline-none min-h-[72px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-gray-500">Мобильность</label>
                    <select
                      value={cardDraft.mobility}
                      onChange={event =>
                        setCardDraft(prev => ({
                          ...prev,
                          mobility:
                            event.target.value === 'walks' || event.target.value === 'sits' || event.target.value === 'lies'
                              ? (event.target.value as 'walks' | 'sits' | 'lies')
                              : prev.mobility,
                        }))
                      }
                      disabled={!canEditCardSettings || isSavingCard}
                      className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-[#7DD3DC] focus:outline-none bg-white"
                    >
                      {MOBILITY_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {canEditCardSettings && (
                  <button
                    type="button"
                    onClick={handleSaveCardDraft}
                    disabled={isSavingCard}
                    className="w-full rounded-2xl bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white font-semibold py-3 shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                  >
                    {isSavingCard ? 'Сохранение...' : 'Сохранить изменения'}
                  </button>
                )}
              </div>
            )}

            {settingsSection === 'metrics' && (
              <div className="mt-5 space-y-5">
                {!canManageMetricsSettings && (
                  <p className="text-sm text-gray-500">
                    Только владелец или организация могут изменять список показателей.
                  </p>
                )}

                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-dark">Показатели ухода</p>
                    <div className="space-y-2 mt-2">
                      {careMetricOptionsState.map(option => {
                        const checked = metricsDraftSelected.includes(option.value)
                        return (
                          <div key={option.value} className="flex items-center justify-between">
                            <label className="flex items-center gap-3 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-[#55ACBF]"
                                checked={checked}
                                onChange={() => handleMetricDraftToggle(option.value)}
                                disabled={!canManageMetricsSettings}
                              />
                              {option.label}
                            </label>
                            {canManageMetricsSettings && !originalCareMetricValuesRef.current.has(option.value) && (
                              <button
                                onClick={() => removeCareOption(option.value)}
                                className="text-red-500 text-sm px-2 py-1"
                                aria-label={`Удалить ${option.label}`}
                                title="Удалить"
                              >
                                🗑
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-dark">Физические показатели</p>
                    <div className="space-y-2 mt-2">
                      {PHYSICAL_METRIC_OPTIONS.map(option => {
                        const checked = metricsDraftSelected.includes(option.value)
                        return (
                          <label key={option.value} className="flex items-center gap-3 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-[#55ACBF]"
                              checked={checked}
                              onChange={() => handleMetricDraftToggle(option.value)}
                              disabled={!canManageMetricsSettings}
                            />
                            {option.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-dark">Выделение мочи и кала</p>
                    <div className="space-y-2 mt-2">
                      {EXCRETION_METRIC_OPTIONS.map(option => {
                        const checked = metricsDraftSelected.includes(option.value)
                        return (
                          <label key={option.value} className="flex items-center gap-3 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-[#55ACBF]"
                              checked={checked}
                              onChange={() => handleMetricDraftToggle(option.value)}
                              disabled={!canManageMetricsSettings}
                            />
                            {option.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-dark">Тягостные симптомы</p>
                    <div className="space-y-2 mt-2">
                      {SYMPTOM_METRIC_OPTIONS.map(option => {
                        const checked = metricsDraftSelected.includes(option.value)
                        return (
                          <label key={option.value} className="flex items-center gap-3 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-[#55ACBF]"
                              checked={checked}
                              onChange={() => handleMetricDraftToggle(option.value)}
                              disabled={!canManageMetricsSettings}
                            />
                            {option.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {customDraftMetrics.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-dark">Пользовательские показатели</p>
                      <div className="space-y-2 mt-2">
                        {customDraftMetrics.map(type => {
                          const checked = metricsDraftSelected.includes(type)
                          return (
                            <label key={type} className="flex items-center gap-3 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-[#55ACBF]"
                                checked={checked}
                                onChange={() => handleMetricDraftToggle(type)}
                                disabled={!canManageMetricsSettings}
                              />
                              {getMetricLabel(type)}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-dark">Закрепленные показатели (до 3)</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {metricsDraftSelected.length === 0 ? (
                      <p className="text-xs text-gray-500">Сначала выберите показатели выше.</p>
                    ) : (
                      metricsDraftSelected.map(type => {
                        const active = metricsDraftPinned.includes(type)
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => handlePinnedDraftToggle(type)}
                            disabled={!canManageMetricsSettings}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                              active
                                ? 'bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white shadow-md'
                                : 'bg-gray-100 text-gray-600'
                            } ${!canManageMetricsSettings ? 'cursor-not-allowed opacity-60' : ''}`}
                          >
                            {getMetricLabel(type)}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>

                {canManageMetricsSettings && (
                  <button
                    type="button"
                    onClick={handleSaveMetricsDraft}
                    disabled={isSavingMetrics}
                    className="w-full rounded-2xl bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] text-white font-semibold py-3 shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                  >
                    {isSavingMetrics ? 'Сохранение...' : 'Сохранить показатели'}
                  </button>
                )}
              </div>
            )}

            {settingsSection === 'access' && (
              <div className="mt-5 space-y-4">
                {!canManageAccessSettings && (
                  <p className="text-sm text-gray-500">
                    Управлять доступом может только владелец дневника.
                  </p>
                )}

                <div className="rounded-2xl bg-[#F5FBFC] px-4 py-4 space-y-2">
                  <p className="text-sm font-semibold text-gray-dark">Сиделка</p>
                  <p className="text-sm text-gray-600">
                    {diary.caregiver_id
                      ? `Доступ предоставлен (ID: ${diary.caregiver_id})`
                      : 'Сиделка не привязана'}
                  </p>
                  {diary.caregiver_id && canManageAccessSettings && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAccess('caregiver')}
                      className="text-sm font-semibold text-red-600 hover:text-red-700"
                    >
                      Отозвать доступ сиделки
                    </button>
                  )}
                </div>

                <div className="rounded-2xl bg-[#F5FBFC] px-4 py-4 space-y-2">
                  <p className="text-sm font-semibold text-gray-dark">Организация</p>
                  <p className="text-sm text-gray-600">
                    {diary.organization_id
                      ? `Доступ предоставлен (ID: ${diary.organization_id})`
                      : 'Организация не привязана'}
                  </p>
                  {diary.organization_id && canManageAccessSettings && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAccess('organization')}
                      className="text-sm font-semibold text-red-600 hover:text-red-700"
                    >
                      Отозвать доступ организации
                    </button>
                  )}
                </div>

                <p className="text-xs text-gray-500">
                  Чтобы выдать доступ, поделитесь ссылкой во вкладке «Поделиться» или отправьте приглашение из раздела
                  «Клиент».
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSettingsClose}
              className="mt-6 w-full rounded-2xl bg-gray-200 text-gray-700 font-semibold py-3 hover:bg-gray-300 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Route manipulation config modal */}
      {isRouteManipulationConfigOpen && manipulationToConfigure && (
        <RouteManipulationModal
          isOpen={isRouteManipulationConfigOpen}
          metric={manipulationToConfigure}
          onClose={() => setIsRouteManipulationConfigOpen(false)}
          onSave={handleSaveRouteManipulation}
        />
      )}

      {/* Модальное окно для заполнения обычных показателей */}
      {selectedMetric && (
        <MetricValueModal
          isOpen={isMetricModalOpen}
          metricType={selectedMetric.type}
          metricLabel={selectedMetric.label}
          onClose={() => {
            setIsMetricModalOpen(false)
            setSelectedMetric(null)
          }}
          onSave={(value) => {
            handleSaveRegularMetric(selectedMetric.type, value)
          }}
        />
      )}
    </div>
  )
}

export default DiaryPage

