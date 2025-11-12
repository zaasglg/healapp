import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { TouchEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { PinnedMetricPanel } from '@/components/PinnedMetricPanel'
import type { MetricFillData } from '@/components/MetricFillModal'
import {
  normalizeClientLink,
  type DiaryClientLink,
  attachClientToDiary,
} from '@/utils/diaryClientLink'

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

type DiaryTab = 'diary' | 'history' | 'client' | 'share'

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
    map.set(normalized.id, normalized)
  })

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
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
      // Fallback на localStorage если RPC не работает
      const storage = JSON.parse(localStorage.getItem('diary_history') || '{}')
      if (!storage || typeof storage !== 'object') return []
      const rawEntries = storage[diaryId] || []
      return mergeDiaryEntries(rawEntries)
    }

    // Преобразуем данные из Supabase в формат DiaryMetricValue
    return (data || []).map((item: any) => {
      const payload = item.payload || {}
      return {
        id: payload.metric_id || `value_${Date.now()}_${Math.random()}`,
        diary_id: diaryId,
        metric_type: payload.metric_key || '',
        value: payload.value || null,
        created_at: item.occurred_at || new Date().toISOString(),
      }
    })
  } catch (error) {
    console.error('Ошибка загрузки истории:', error)
    // Fallback на localStorage
    const storage = JSON.parse(localStorage.getItem('diary_history') || '{}')
    if (!storage || typeof storage !== 'object') return []
    const rawEntries = storage[diaryId] || []
    return mergeDiaryEntries(rawEntries)
  }
}

const persistDiaryHistoryEntries = (diaryId: string, entries: DiaryMetricValue[]) => {
  try {
    const storage = JSON.parse(localStorage.getItem('diary_history') || '{}')
    const nextStorage = {
      ...(storage && typeof storage === 'object' ? storage : {}),
      [diaryId]: entries,
    }
    localStorage.setItem('diary_history', JSON.stringify(nextStorage))
  } catch (error) {
    console.warn('Не удалось сохранить историю дневника', error)
  }
}

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
  { value: 'sleep', label: 'Сон' },
]

const PHYSICAL_METRIC_OPTIONS = [
  { value: 'temperature', label: 'Температура' },
  { value: 'blood_pressure', label: 'Артериальное давление' },
  { value: 'breathing_rate', label: 'Частота дыхания' },
  { value: 'pain_level', label: 'Уровень боли' },
  { value: 'saturation', label: 'Сатурация' },
  { value: 'blood_sugar', label: 'Уровень сахара в крови' },
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
            <textarea
              value={textValue}
              onChange={event => setTextValue(event.target.value)}
              placeholder={config.placeholder || 'Добавьте описание'}
              className="w-full min-h-[92px] rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-[#7DD3DC] focus:outline-none"
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

  const userRole = currentUser.user_role || user?.user_metadata?.user_role
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
  const effectiveOrganizationId = userOrganizationId || (isOrganizationAccount ? userId : null)
  const effectiveCaregiverId = userCaregiverId || (isCaregiver ? userId : null)

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
  const [externalAccessLinks, setExternalAccessLinks] = useState<Array<{ id: string; link: string; created_at: string }>>([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<'card' | 'metrics' | 'access'>('card')
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
  const [assignedEmployees, setAssignedEmployees] = useState<
    Array<{ user_id: string; first_name?: string; last_name?: string; role?: string; organization_type?: OrganizationType | null }>
  >([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false)
  const updateAttachedClientInfo = (link: DiaryClientLink | null) => {
    if (!link?.accepted_by) {
      setAttachedClient(null)
      return
    }
    try {
      const clients = JSON.parse(localStorage.getItem('local_clients') || '[]')
      const clientData = clients.find(
        (client: any) => String(client.user_id) === String(link.accepted_by)
      )
      setAttachedClient(clientData || null)
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

  useEffect(() => {
    if (!id) return
    const rawOrgLinks = localStorage.getItem('diary_client_links')
    if (rawOrgLinks) {
      try {
        const parsed = JSON.parse(rawOrgLinks)
        if (parsed && parsed[id]) {
          const normalized = normalizeClientLink(parsed[id], {
            diaryId: id,
            patientCardId: diary?.patient_card_id ?? null,
            organizationId: diary?.organization_id ?? effectiveOrganizationId ?? null,
          })
          if (normalized) {
            setOrganizationClientLink(normalized)
            updateAttachedClientInfo(normalized)
            if (
              !parsed[id].token ||
              parsed[id].token !== normalized.token ||
              parsed[id].accepted_by !== normalized.accepted_by ||
              parsed[id].accepted_at !== normalized.accepted_at ||
              parsed[id].diary_id !== normalized.diary_id
            ) {
              const updated = { ...parsed, [id]: normalized }
              localStorage.setItem('diary_client_links', JSON.stringify(updated))
            }
          } else {
            setOrganizationClientLink(null)
            setAttachedClient(null)
          }
        } else {
          setOrganizationClientLink(null)
          setAttachedClient(null)
        }
      } catch (error) {
        console.warn('Не удалось прочитать diary_client_links', error)
      }
    } else {
      setOrganizationClientLink(null)
      setAttachedClient(null)
    }

    const rawExternalLinks = localStorage.getItem('diary_external_access_links')
    if (rawExternalLinks) {
      try {
        const parsed = JSON.parse(rawExternalLinks)
        if (Array.isArray(parsed[id])) {
          setExternalAccessLinks(parsed[id])
        }
      } catch (error) {
        console.warn('Не удалось прочитать diary_external_access_links', error)
      }
    }
  }, [id, diary?.patient_card_id, diary?.organization_id, effectiveOrganizationId])

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
    const isClientAccess = matches(diary.client_id, userId)
    const organizationAccountAccess =
      isOrganizationAccount &&
      (matches(diary.organization_id, effectiveOrganizationId) ||
        (!diary.organization_id && matches(diary.owner_id, effectiveOrganizationId)))
    const assignedEmployeeIds = assignedEmployees.map(employee => employee.user_id)
    const requiresAssignment =
      assignmentOrganizationType === 'patronage_agency' || assignmentOrganizationType === 'pension'
    const hasEmployeeAssignment =
      !requiresAssignment || (userId ? assignedEmployeeIds.includes(userId) : false)
    const organizationEmployeeAccess =
      isOrgEmployee &&
      (matches(diary.organization_id, userOrganizationId || effectiveOrganizationId) ||
        (!diary.organization_id && matches(diary.owner_id, userOrganizationId || effectiveOrganizationId))) &&
      hasEmployeeAssignment
    const caregiverAccess =
      (isCaregiver || !!effectiveCaregiverId) && matches(diary.caregiver_id, effectiveCaregiverId)

    const hasBaseAccess =
      isOwner || isClientAccess || organizationAccountAccess || organizationEmployeeAccess || caregiverAccess

    return {
      hasBaseAccess,
      isOwner,
      isClientAccess,
      organizationAccountAccess,
      organizationEmployeeAccess,
      caregiverAccess,
      canManageDiarySettings: isOwner || organizationAccountAccess,
      canEditCardSettings: isOwner,
      canManageMetricsSettings: isOwner || organizationAccountAccess,
      canManageAccessSettings: isOwner,
    }
  }, [
    diary,
    userId,
    effectiveOrganizationId,
    userOrganizationId,
    effectiveCaregiverId,
    isOrganizationAccount,
    isOrgEmployee,
    isCaregiver,
    assignedEmployees,
    organizationType,
  ])

  // Функция для загрузки назначенных сотрудников из Supabase
  const loadAssignedEmployees = async () => {
    if (!diary || !id) return

    try {
      const { data, error } = await supabase
        .from('diary_employee_access')
        .select(`
          user_id,
          organization_employees!inner (
            first_name,
            last_name,
            employee_role,
            organizations!inner (
              organization_type
            )
          )
        `)
        .eq('diary_id', id)
        .is('revoked_at', null)

      if (error) {
        console.error('Ошибка загрузки назначенных сотрудников:', error)
        // Fallback на localStorage
        const storedAssignments = JSON.parse(localStorage.getItem('diary_employee_access') || '{}')
        const currentAssignments = Array.isArray(storedAssignments?.[diary.id])
          ? storedAssignments[diary.id]
          : []
        return currentAssignments.map((item: any) => ({
          user_id: item.user_id,
          first_name: item.first_name || '',
          last_name: item.last_name || '',
          role: item.role || '',
          organization_type: item.organization_type || null,
        }))
      }

      // Преобразуем данные из Supabase
      return (data || []).map((item: any) => ({
        user_id: item.user_id,
        first_name: item.organization_employees?.first_name || '',
        last_name: item.organization_employees?.last_name || '',
        role: item.organization_employees?.employee_role || '',
        organization_type: item.organization_employees?.organizations?.organization_type || null,
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
      normalizedAssignments = await loadAssignedEmployees()

      let employeesForOrganization: Array<{ user_id: string; first_name?: string; last_name?: string; role?: string }> = []

      if (isOrganizationAccount) {
        try {
          // Загружаем сотрудников из Supabase
          const orgId = normalizeId(effectiveOrganizationId) || normalizeId(diary.organization_id)
          if (orgId) {
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

            if (!employeesError && employeesData) {
              employeesForOrganization = employeesData.map((emp: any) => ({
                user_id: emp.user_id,
                first_name: emp.first_name || '',
                last_name: emp.last_name || '',
                role: emp.role || '',
                organization_type: emp.organizations?.organization_type || null,
              }))
            }
          }

          // Fallback на localStorage если Supabase не работает
          if (employeesForOrganization.length === 0) {
            const employeesRaw = JSON.parse(localStorage.getItem('local_employees') || '[]')
            const employees = Array.isArray(employeesRaw) ? [...employeesRaw] : []

            const candidateOrgIds = [
              normalizeId(effectiveOrganizationId),
              normalizeId(userOrganizationId),
              normalizeId(currentUser.organization_id),
              normalizeId(diary.organization_id),
            ]
              .filter((id): id is string => Boolean(id))
              .filter((id, index, arr) => arr.indexOf(id) === index)

            const filteredEmployees = employees.filter((employee: any) => {
              if (!employee) return false
              const employeeOrgId = normalizeId(employee.organization_id)
              return Boolean(employeeOrgId && candidateOrgIds.includes(employeeOrgId))
            })

            employeesForOrganization = filteredEmployees.map((employee: any) => ({
              user_id: employee.user_id || employee.id,
              first_name: employee.first_name || '',
              last_name: employee.last_name || '',
              role: employee.role || '',
              organization_type: employee.organization_type || null,
            }))
          }
        } catch (error) {
          console.warn('Не удалось загрузить сотрудников организации', error)
          employeesForOrganization = []
        }
      }

      setAvailableOrgEmployees(employeesForOrganization)

      // Для пансионатов по умолчанию все сотрудники имеют доступ, если доступы не настроены явно.
      let assignmentsToPersist: Array<{ user_id: string; first_name?: string; last_name?: string; role?: string }> | null =
        null
      if (
        isOrganizationAccount &&
        assignmentOrganizationType === 'pension' &&
        normalizedAssignments.length === 0 &&
        employeesForOrganization.length > 0
      ) {
        normalizedAssignments = employeesForOrganization
        assignmentsToPersist = employeesForOrganization
        console.log('[DiaryPage] auto-assign all employees for pension', assignmentsToPersist)
      } else if (isOrganizationAccount && employeesForOrganization.length > 0) {
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
  }, [diary, isOrganizationAccount, organizationType, effectiveOrganizationId])

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
    canEditCardSettings,
    canManageMetricsSettings,
    canManageAccessSettings,
  } = accessState

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
  const generateMetricId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `metric_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  type EmployeeAccessEntry = {
    user_id: string
    first_name?: string
    last_name?: string
    role?: string
    organization_type?: OrganizationType | null
  }

  const toEmployeeAccessEntry = (source: any): EmployeeAccessEntry | null => {
    if (!source) return null
    const normalizedId = normalizeId(source.user_id || source.id)
    if (!normalizedId) return null
    return {
      user_id: normalizedId,
      first_name: source.first_name || source.firstName || '',
      last_name: source.last_name || source.lastName || '',
      role: source.role || source.employee_role || null,
      organization_type:
        source.organization_type || source.organizationType || source.type || null,
    }
  }

  const persistAssignedEmployees = (next: EmployeeAccessEntry[]) => {
    if (!diary) return
    try {
      const stored = JSON.parse(localStorage.getItem('diary_employee_access') || '{}')
      stored[diary.id] = next.map(item => ({
        user_id: item.user_id,
        first_name: item.first_name || '',
        last_name: item.last_name || '',
        role: item.role || '',
        organization_type: item.organization_type || null,
      }))
      localStorage.setItem('diary_employee_access', JSON.stringify(stored))
      console.log('[DiaryPage] persistAssignedEmployees', { diaryId: diary.id, next })
      setAssignedEmployees(next)
    } catch (error) {
      console.warn('Не удалось сохранить список специалистов дневника', error)
    }
  }

  const resolveEmployeeById = (targetId: string): EmployeeAccessEntry | null => {
    const normalizedTarget = normalizeId(targetId)
    if (!normalizedTarget) return null

    const sources: any[] = []
    sources.push(...availableOrgEmployees)

    try {
      const employees = JSON.parse(localStorage.getItem('local_employees') || '[]')
      if (Array.isArray(employees)) {
        sources.push(...employees)
      }
    } catch (error) {
      console.warn('[DiaryPage] resolveEmployeeById: failed to read local_employees', error)
    }

    try {
      const users = JSON.parse(localStorage.getItem('local_users') || '[]')
      if (Array.isArray(users)) {
        sources.push(
          ...users.map(user => ({
            ...user,
            first_name:
              user.profile_data?.firstName || user.first_name || user.firstName || user.name || '',
            last_name:
              user.profile_data?.lastName || user.last_name || user.lastName || user.surname || '',
          }))
        )
      }
    } catch (error) {
      console.warn('[DiaryPage] resolveEmployeeById: failed to read local_users', error)
    }

    for (const source of sources) {
      const entry = toEmployeeAccessEntry(source)
      if (entry && entry.user_id === normalizedTarget) {
        return entry
      }
    }

    return null
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

    if (
      assignedEmployees.some(item => normalizeTarget(item.user_id) === normalizeTarget(targetId))
    ) {
      if (!employeeId) {
        setSelectedEmployeeId('')
      }
      console.log('[DiaryPage] handleAddEmployeeAccess: already has access', { targetId })
      return
    }

    try {
      // Используем RPC для назначения доступа
      const { error } = await supabase.rpc('assign_employee_to_diary', {
        p_diary_id: id,
        p_user_id: targetId,
      })

      if (error) {
        console.error('Ошибка назначения доступа:', error)
        setSettingsError(error.message || 'Не удалось назначить доступ. Попробуйте позже.')
        return
      }

      // Обновляем локальное состояние
      const accessEntry = resolveEmployeeById(targetId)
      if (accessEntry) {
        const next = [...assignedEmployees, accessEntry]
        setAssignedEmployees(next)
        if (!employeeId) {
          setSelectedEmployeeId('')
        }
        setSettingsError(null)
      } else {
        // Если не нашли в локальных данных, перезагружаем список
        await loadAssignedEmployees()
      }
    } catch (error) {
      console.error('Ошибка назначения доступа:', error)
      setSettingsError('Не удалось назначить доступ. Попробуйте позже.')
    }
  }

  const handleRemoveEmployeeAccess = async (userId: string) => {
    if (!diary || !id) return

    try {
      // Используем RPC для отзыва доступа
      const { error } = await supabase.rpc('remove_employee_from_diary', {
        p_diary_id: id,
        p_user_id: userId,
      })

      if (error) {
        console.error('Ошибка отзыва доступа:', error)
        setSettingsError(error.message || 'Не удалось отозвать доступ. Попробуйте позже.')
        return
      }

      // Обновляем локальное состояние
      const next = assignedEmployees.filter(employee => employee.user_id !== userId)
      setAssignedEmployees(next)
      setSettingsError(null)
    } catch (error) {
      console.error('Ошибка отзыва доступа:', error)
      setSettingsError('Не удалось отозвать доступ. Попробуйте позже.')
    }
  }

  const handleRemoveAccess = (accessType: 'caregiver' | 'organization') => {
    if (!diary || !id) return

    const confirmed = window.confirm(
      accessType === 'caregiver' 
        ? 'Вы уверены, что хотите отозвать доступ у сиделки?' 
        : 'Вы уверены, что хотите отозвать доступ у организации?'
    )

    if (!confirmed) return

    // Обновляем дневник в localStorage
    const diaries = JSON.parse(localStorage.getItem('diaries') || '[]')
    const updatedDiaries = diaries.map((d: Diary) => {
      if (d.id === id) {
        return {
          ...d,
          [accessType === 'caregiver' ? 'caregiver_id' : 'organization_id']: null
        }
      }
      return d
    })

    localStorage.setItem('diaries', JSON.stringify(updatedDiaries))

    // Обновляем состояние
    setDiary({
      ...diary,
      [accessType === 'caregiver' ? 'caregiver_id' : 'organization_id']: null
    })
    if (accessType === 'organization') {
      persistAssignedEmployees([])
      try {
        const stored = JSON.parse(localStorage.getItem('diary_client_links') || '{}')
        if (stored && stored[id]) {
          delete stored[id]
          localStorage.setItem('diary_client_links', JSON.stringify(stored))
        }
      } catch (error) {
        console.warn('Не удалось очистить ссылку клиента при удалении доступа организации', error)
      }
      setOrganizationClientLink(null)
      setAttachedClient(null)
    }

    alert('Доступ успешно отозван')
  }

  useEffect(() => {
    if (!user) {
      const clientInviteToken = searchParams.get('client')
      if (clientInviteToken) {
        navigate(`/client-invite?diary=${id}&token=${clientInviteToken}`, { replace: true })
      } else {
        navigate('/login')
      }
      return
    }

    // Загружаем дневник
    const diaries = JSON.parse(localStorage.getItem('diaries') || '[]')
    const foundDiary = diaries.find((d: Diary) => d.id === id)
    
    if (!foundDiary) {
      navigate('/dashboard')
      return
    }
    
    console.log('[DiaryPage] Loaded diary', foundDiary)
    let normalizedDiary = foundDiary
    if (!normalizedDiary.organization_type) {
      const derivedOrgType = organizationType || currentUser.organization_type || null
      if (derivedOrgType) {
        normalizedDiary = { ...normalizedDiary, organization_type: derivedOrgType }
        const updatedList = diaries.map((d: Diary) => (d.id === normalizedDiary.id ? normalizedDiary : d))
        localStorage.setItem('diaries', JSON.stringify(updatedList))
      }
    }
    setDiary(normalizedDiary)

    // Загружаем карточку подопечного
    const cards = JSON.parse(localStorage.getItem('patient_cards') || '[]')
    const foundCard = cards.find((c: PatientCard) => c.id === normalizedDiary.patient_card_id)
    
    if (foundCard) {
      setPatientCard(foundCard)
    }

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
          // Fallback на localStorage
          const allMetrics = JSON.parse(localStorage.getItem('diary_metrics') || '[]')
          const diaryMetrics = allMetrics.filter((m: DiaryMetric) => m.diary_id === id)
          setMetrics(diaryMetrics)
        } else {
          setMetrics((metricsData || []).map((m: any) => ({
            id: m.id,
            diary_id: m.diary_id,
            metric_type: m.metric_key,
            is_pinned: m.is_pinned,
            settings: m.metadata?.settings || undefined,
          })))
        }
      } catch (error) {
        console.error('Ошибка загрузки метрик:', error)
      }
    }

    // Загружаем значения показателей из Supabase
    const loadMetricValues = async () => {
      if (!id) return

      try {
        // Загружаем историю за сегодня
        const today = new Date().toISOString().split('T')[0]
        const historyEntries = await loadDiaryHistoryEntries(id, today)

        // Также загружаем последние значения метрик
        const { data: valuesData, error: valuesError } = await supabase
          .from('diary_metric_values')
          .select('*')
          .eq('diary_id', id)
          .order('recorded_at', { ascending: false })
          .limit(100)

        if (valuesError) {
          console.error('Ошибка загрузки значений метрик:', valuesError)
          // Fallback на localStorage
          const allValues = JSON.parse(localStorage.getItem('diary_metric_values') || '[]')
          const diaryValues = allValues.filter((v: DiaryMetricValue) => v.diary_id === id)
          setMetricValues(diaryValues)
        } else {
          // Преобразуем данные из Supabase в формат DiaryMetricValue
          const supabaseValues = (valuesData || []).map((v: any) => ({
            id: v.id,
            diary_id: v.diary_id,
            metric_type: v.metric_key,
            value: v.value,
            created_at: v.recorded_at || v.created_at,
          }))

          // Объединяем с историей
          const mergedValues = mergeDiaryEntries([...supabaseValues, ...historyEntries])
          setMetricValues(mergedValues)
        }
      } catch (error) {
        console.error('Ошибка загрузки значений метрик:', error)
      }
    }

    loadMetrics()
    loadMetricValues()

    // Загружаем настройки времени заполнения
    const rawSettings = JSON.parse(localStorage.getItem('diary_metric_settings') || '{}')
    const loadedSettings: Record<string, MetricSettings> = {}

    Object.entries(rawSettings).forEach(([key, value]) => {
      if (!key.startsWith(`${id}_`)) return
      const metricType = key.slice(`${id}_`.length)
      loadedSettings[metricType] = normalizeSettings(value)
    })

    metrics.forEach((metric: DiaryMetric) => {
      if (!loadedSettings[metric.metric_type] && metric.settings) {
        loadedSettings[metric.metric_type] = normalizeSettings(metric.settings)
      }
    })

    if (Object.keys(loadedSettings).length > 0) {
      const persistedSettings = JSON.parse(localStorage.getItem('diary_metric_settings') || '{}')
      let shouldPersist = false
      Object.entries(loadedSettings).forEach(([metricType, settings]) => {
        const key = `${id}_${metricType}`
        if (!persistedSettings[key]) {
          persistedSettings[key] = settings
          shouldPersist = true
        }
      })
      if (shouldPersist) {
        localStorage.setItem('diary_metric_settings', JSON.stringify(persistedSettings))
      }
    }

    setMetricSettings(loadedSettings)
    setCurrentTime(new Date())
  }, [id, user, navigate, searchParams])

  useEffect(() => {
    if (!id || !user || !diary) return

    const clientToken = searchParams.get('client')
    if (!clientToken) return

    let storedLinksRaw: string | null = null
    let storedLinks: Record<string, DiaryClientLink> = {}

    try {
      storedLinksRaw = localStorage.getItem('diary_client_links')
      storedLinks = storedLinksRaw
        ? (JSON.parse(storedLinksRaw) as Record<string, DiaryClientLink>)
        : {}
    } catch (error) {
      console.warn('Не удалось прочитать diary_client_links для принятия доступа', error)
      storedLinks = {}
    }

    const linkEntryRaw = storedLinks?.[id]
    const linkEntry = normalizeClientLink(linkEntryRaw, {
      diaryId: id,
      patientCardId: diary.patient_card_id ?? null,
      organizationId: diary.organization_id ?? effectiveOrganizationId ?? null,
    })

    if (!linkEntry) {
      alert('Ссылка приглашения недействительна или устарела')
      navigate(`/diaries/${id}`, { replace: true })
      return
    }

    if (linkEntry.token !== clientToken) {
      alert('Ссылка приглашения недействительна')
      navigate(`/diaries/${id}`, { replace: true })
      return
    }

    if (linkEntry.accepted_by && linkEntry.accepted_by !== user.id) {
      alert('Эта ссылка уже была использована другим пользователем')
      navigate(`/diaries/${id}`, { replace: true })
      return
    }

    const { diary: updatedDiary, patientCard: updatedCard } = attachClientToDiary({
      diaryId: id,
      clientId: user.id,
    })

    if (!updatedDiary) {
      alert('Дневник не найден или уже удалён')
      navigate('/dashboard', { replace: true })
      return
    }

    setDiary(updatedDiary)

    if (updatedCard) {
      setPatientCard(updatedCard as PatientCard)
    }

    const normalizedLink = {
      ...linkEntry,
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
      diary_id: id,
      patient_card_id: updatedDiary.patient_card_id,
      organization_id: updatedDiary.organization_id,
    }

    const nextLinks = {
      ...storedLinks,
      [id]: normalizedLink,
    }

    localStorage.setItem('diary_client_links', JSON.stringify(nextLinks))
    setOrganizationClientLink(normalizedLink)
    updateAttachedClientInfo(normalizedLink)

    alert('Дневник успешно привязан к вашему аккаунту. Вы можете управлять доступом и делиться дневником со специалистами.')
    navigate(`/diaries/${id}`, { replace: true })
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
  const careMetrics = metrics.filter(
    m =>
      !m.is_pinned &&
      ['walk', 'cognitive_games', 'diaper_change', 'hygiene', 'skin_moisturizing', 'meal', 'medications', 'vitamins', 'sleep'].includes(m.metric_type)
  )
  const physicalMetrics = metrics.filter(
    m =>
      !m.is_pinned &&
      ['temperature', 'blood_pressure', 'breathing_rate', 'pain_level', 'saturation', 'blood_sugar'].includes(m.metric_type)
  )
  const excretionMetrics = metrics.filter(
    m => !m.is_pinned && ['urination', 'defecation'].includes(m.metric_type)
  )
  const symptomMetrics = metrics.filter(
    m =>
      !m.is_pinned &&
      ['nausea', 'vomiting', 'shortness_of_breath', 'itching', 'cough', 'dry_mouth', 'hiccups', 'taste_disturbance'].includes(m.metric_type)
  )

  const getMetricLabel = (metricType: string): string => {
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
    
    // Объединяем данные из Supabase и локальные значения
    const allEntries = [...metricValues, ...historyForDate]
    
    return allEntries
      .filter(entry => {
        const entryDate = new Date(entry.created_at)
        return (
          entryDate.getFullYear() === targetDate.getFullYear() &&
          entryDate.getMonth() === targetDate.getMonth() &&
          entryDate.getDate() === targetDate.getDate()
        )
      })
      .map(entry => {
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

        return {
          ...entry,
          label: getMetricLabel(entry.metric_type),
          time,
          displayValue,
        }
      })
  }, [metricValues, selectedDate])

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
    ]

    if (isOrganization) {
      base.push({ id: 'client', label: 'Клиент' })
    }

    if (isClient) {
      base.push({ id: 'share', label: 'Поделиться' })
    }

    return base
  }, [isOrganization, isClient])
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
        ...CARE_METRIC_OPTIONS.map(option => option.value),
        ...PHYSICAL_METRIC_OPTIONS.map(option => option.value),
        ...EXCRETION_METRIC_OPTIONS.map(option => option.value),
        ...SYMPTOM_METRIC_OPTIONS.map(option => option.value),
      ]),
    []
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
        // Fallback на localStorage
        const entry: DiaryMetricValue = {
          id: `value_${Date.now()}`,
          diary_id: id,
          metric_type: metricType,
          value,
          created_at: new Date().toISOString(),
        }
        const storedValues = JSON.parse(localStorage.getItem('diary_metric_values') || '[]')
        const mergedStoredValues = mergeDiaryEntries([...storedValues, entry])
        localStorage.setItem('diary_metric_values', JSON.stringify(mergedStoredValues))
        const mergedHistoryValues = mergeDiaryEntries([...metricValues, entry])
        setMetricValues(mergedHistoryValues)
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
    } catch (error) {
      console.error('Ошибка сохранения метрики:', error)
    }
  }

  const persistOrganizationLink = (data: DiaryClientLink) => {
    if (!id) return
    const normalized = normalizeClientLink(data, {
      diaryId: id,
      patientCardId: diary?.patient_card_id ?? null,
      organizationId: diary?.organization_id ?? effectiveOrganizationId ?? null,
    })
    if (!normalized) return
    const stored = JSON.parse(localStorage.getItem('diary_client_links') || '{}')
    stored[id] = normalized
    localStorage.setItem('diary_client_links', JSON.stringify(stored))
    setOrganizationClientLink(normalized)
    updateAttachedClientInfo(normalized)
  }

  const handleCreateOrganizationLink = () => {
    if (!id) return
    const token = crypto.randomUUID()
    const link = `${appOrigin}/client-invite?diary=${id}&token=${token}`
    const data: DiaryClientLink = {
      link,
      created_at: new Date().toISOString(),
      token,
      diary_id: id,
      patient_card_id: diary?.patient_card_id ?? null,
      organization_id: diary?.organization_id ?? effectiveOrganizationId ?? null,
      accepted_by: null,
      accepted_at: null,
    }
    persistOrganizationLink(data)
    setAttachedClient(null)
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

  const persistExternalLinks = (links: Array<{ id: string; link: string; created_at: string }>) => {
    if (!id) return
    const stored = JSON.parse(localStorage.getItem('diary_external_access_links') || '{}')
    stored[id] = links
    localStorage.setItem('diary_external_access_links', JSON.stringify(stored))
    setExternalAccessLinks(links)
  }

  const handleCreateExternalLink = () => {
    if (!id) return
    const token = crypto.randomUUID()
    const link = `${appOrigin}/diaries/${id}?access=${token}`
    const entry = { id: token, link, created_at: new Date().toISOString() }
    const next = [...externalAccessLinks, entry]
    persistExternalLinks(next)
  }

  const handleRevokeExternalLink = (linkId: string) => {
    const next = externalAccessLinks.filter(item => item.id !== linkId)
    persistExternalLinks(next)
  }

  const handleSaveMetric = (metricType: string, data: MetricFillData) => {
    if (!id) return

    // Сохранение значения показателя
    const shouldPersistValue =
      data.value !== undefined &&
      data.value !== null &&
      String(data.value).trim() !== ''

    let newValue: DiaryMetricValue | null = null

    if (shouldPersistValue) {
      newValue = {
        id: `value_${Date.now()}`,
        diary_id: id,
        metric_type: metricType,
        value: data.value,
        created_at: new Date().toISOString(),
      }

      const allValues = JSON.parse(localStorage.getItem('diary_metric_values') || '[]')
      const mergedValues = mergeDiaryEntries([...allValues, newValue])
      localStorage.setItem('diary_metric_values', JSON.stringify(mergedValues))
    }

    // Сохранение настроек частоты и напоминаний
    const settings = {
      frequency: data.frequency,
      reminderStart: data.reminderStart,
      reminderEnd: data.reminderEnd,
      times: data.times,
    }
    
    const allSettings = JSON.parse(localStorage.getItem('diary_metric_settings') || '{}')
    allSettings[`${id}_${metricType}`] = settings
    localStorage.setItem('diary_metric_settings', JSON.stringify(allSettings))

    try {
      const allMetrics = JSON.parse(localStorage.getItem('diary_metrics') || '[]') as DiaryMetric[]
      let shouldUpdateMetrics = false
      const updatedMetrics = allMetrics.map(metric => {
        if (metric.diary_id === id && metric.metric_type === metricType) {
          shouldUpdateMetrics = true
          return {
            ...metric,
            settings: normalizeSettings(settings),
          }
        }
        return metric
      })
      if (shouldUpdateMetrics) {
        localStorage.setItem('diary_metrics', JSON.stringify(updatedMetrics))
        setMetrics(updatedMetrics.filter(metric => metric.diary_id === id))
      }
    } catch (error) {
      console.warn('Не удалось обновить настройки закрепленного показателя в diary_metrics', error)
    }

    // Обновление состояния
    if (shouldPersistValue && newValue) {
      const mergedHistory = mergeDiaryEntries([...metricValues, newValue])
      setMetricValues(mergedHistory)
      persistDiaryHistoryEntries(
        id,
        mergedHistory.filter(entry => entry.diary_id === id)
      )
    }
    setMetricSettings(prev => ({
      ...prev,
      [metricType]: normalizeSettings(settings),
    }))
    setCurrentTime(new Date())
    if (panelMetric === metricType) {
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

  const handleSaveMetricsDraft = () => {
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
      const existingMetrics = JSON.parse(localStorage.getItem('diary_metrics') || '[]') as DiaryMetric[]
      const existingMap = new Map(metrics.map(metric => [metric.metric_type, metric]))
      const newMetrics: DiaryMetric[] = []

      normalizedPinned.forEach(type => {
        const existing = existingMap.get(type)
        newMetrics.push({
          id: existing?.id || generateMetricId(),
          diary_id: id,
          metric_type: type,
          is_pinned: true,
          settings: existing?.settings || metricSettings[type],
        })
      })

      uniqueSelected
        .filter(type => !normalizedPinned.includes(type))
        .forEach(type => {
          const existing = existingMap.get(type)
          newMetrics.push({
            id: existing?.id || generateMetricId(),
            diary_id: id,
            metric_type: type,
            is_pinned: false,
            settings: existing?.settings || metricSettings[type],
          })
        })

      const removedTypes = metrics
        .map(metric => metric.metric_type)
        .filter(type => !uniqueSelected.includes(type))

      const updatedMetricSettings = { ...metricSettings }
      if (removedTypes.length > 0) {
        const storedSettings = JSON.parse(localStorage.getItem('diary_metric_settings') || '{}')
        let settingsChanged = false
        removedTypes.forEach(type => {
          const key = `${id}_${type}`
          if (storedSettings[key]) {
            delete storedSettings[key]
            settingsChanged = true
          }
          if (updatedMetricSettings[type]) {
            delete updatedMetricSettings[type]
          }
        })
        if (settingsChanged) {
          localStorage.setItem('diary_metric_settings', JSON.stringify(storedSettings))
        }
      }

      const remaining = existingMetrics.filter(metric => metric.diary_id !== id)
      localStorage.setItem('diary_metrics', JSON.stringify([...remaining, ...newMetrics]))
      setMetrics(newMetrics)
      setMetricSettings(updatedMetricSettings)
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
                          className={`bg-gradient-to-br from-[#61B4C6] to-[#317799] rounded-2xl p-3 text-white text-center shadow-md flex flex-col items-center w-full ${
                            !canFillMetrics ? 'opacity-60 cursor-not-allowed' : ''
                          }`}
                          style={{ fontFamily: 'Manrope, sans-serif', ...cardStyle }}
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
                              minHeight: '38px',
                              lineHeight: '1.1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {getMetricLabel(metric.metric_type)}
                          </div>

                          <div className="flex items-center justify-center w-full" style={{ height: '90px' }}>
                            <div className="relative flex items-center justify-center" style={{ width: '90px', height: '90px' }}>
                              <svg className="absolute inset-0" width="90" height="90" viewBox="0 0 90 90">
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
                                style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700 }}
                              >
                                {displayValue}
                              </div>
                            </div>
                          </div>

                          <div className="w-full space-y-1.5 mt-2">
                            <div
                              className="text-xs opacity-90 text-center"
                              style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 400 }}
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
              {/* Изменить показатели (только для владельцев и организаций) */}
              {canFillMetrics && !(isOrgEmployee || isCaregiver) && (
                <button
                  onClick={() => navigate(`/diaries/${id}/edit-metrics`)}
                  className="w-full bg-white rounded-3xl shadow-sm px-5 py-3 text-center"
                >
                  <h3 className="text-base font-bold text-[#7DD3DC]">
                    Изменить показатели
                  </h3>
                </button>
              )}

              {/* Управление доступом */}
              {!isOrgEmployee && !isCaregiver && (
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
                    {organizationAccountAccess && !(isOrgEmployee || isCaregiver) ? (
                      <div className="space-y-3">
                        {assignmentOrganizationType === 'patronage_agency' ? (
                          <>
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
                          </>
                        ) : availableOrgEmployees.length > 0 ? (
                          <div>
                            <p className="text-sm font-semibold text-gray-700 mb-2">
                              Сотрудники организации
                            </p>
                            <div className="space-y-2">
                              {availableOrgEmployees.map(employee => (
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
                                  </div>
                                  {assignedEmployeesDisplay.some(item => item.user_id === employee.user_id) ? (
                                    <button
                                      onClick={() => handleRemoveEmployeeAccess(employee.user_id)}
                                      className="text-red-600 hover:text-red-700 text-lg"
                                      aria-label="Удалить доступ специалиста"
                                    >
                                      🗑️
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleAddEmployeeAccess(employee.user_id)}
                                      className="text-[#0A6D83] hover:text-[#055063] text-lg"
                                      aria-label="Добавить доступ"
                                    >
                                      ➕
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500">
                              Сотрудники пансионата имеют доступ к дневнику автоматически; можно убрать специалиста при необходимости.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

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
                      {assignmentOrganizationType === 'patronage_agency' &&
                        organizationAccountAccess &&
                        assignedEmployeesDisplay.length > 0 && (
                        <div className="space-y-2">
                          {assignedEmployeesDisplay.map(employee => (
                            <div
                              key={`client-view-${employee.user_id}`}
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
                              {canManageAccessSettings && (
                                <button
                                  onClick={() => handleRemoveEmployeeAccess(employee.user_id)}
                                  className="text-red-600 hover:text-red-700 text-lg"
                                  aria-label="Удалить доступ специалиста"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
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
                      {diary?.organization_id &&
                        canManageAccessSettings &&
                        (organizationType !== 'patronage_agency' || organizationAccountAccess) && (
                          <div className="flex items-center justify-between py-2 border-b border-gray-100">
                            <div>
                              <p className="text-sm text-gray-800">Организация</p>
                              <p className="text-xs text-gray-500">ID: {diary.organization_id}</p>
                            </div>
                            <button
                              onClick={() => handleRemoveAccess('organization')}
                              className="text-red-600 hover:text-red-700 text-lg"
                              aria-label="Удалить доступ организации"
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
                        {group.items.map(item => (
                          <div
                            key={item.id}
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
                        {group.items.map(item => (
                          <div
                            key={item.id}
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

        {activeTab === 'client' && isOrganization && (
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
                          <Button onClick={() => handleCopyLink(link.link)} fullWidth>
                            Скопировать
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              openWhatsApp(
                                link.link,
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
                      {CARE_METRIC_OPTIONS.map(option => {
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

