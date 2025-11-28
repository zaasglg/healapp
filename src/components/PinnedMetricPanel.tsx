import { useEffect, useMemo, useState, useRef } from 'react'
import { Input } from '@/components/ui'
import type { MetricFillData } from '@/components/MetricFillModal'

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

interface PinnedMetricPanelProps {
  metricType: string
  metricLabel: string
  lastValue: string | null
  onSave: (metricType: string, data: MetricFillData) => void
  onClose: () => void
  initialTimes?: string[]
}

export const PinnedMetricPanel = ({
  metricType,
  metricLabel,
  lastValue,
  onSave,
  onClose,
  initialTimes,
}: PinnedMetricPanelProps) => {
  const initialTimesNormalized = useMemo(() => {
    if (!initialTimes || initialTimes.length === 0) return []
    return Array.from(new Set(initialTimes)).sort()
  }, [initialTimes])
  const [value, setValue] = useState<string>('')
  const [times, setTimes] = useState<string[]>(
    () => (initialTimes && initialTimes.length > 0 ? [...initialTimes].sort() : [])
  )
  const [timeInput, setTimeInput] = useState<string>(
    () => (initialTimes && initialTimes.length > 0 ? [...initialTimes].sort()[0] : '')
  )
  const [timeLeft, setTimeLeft] = useState<string>('Выберите время')
  const hasUnsavedTimeRef = useRef<boolean>(false)
  // Используем ref для хранения актуальных значений при размонтировании
  const currentValuesRef = useRef<{
    timeInput: string
    times: string[]
    value: string
    metricType: string
  }>({
    timeInput: '',
    times: [],
    value: '',
    metricType: '',
  })

  useEffect(() => {
    if (initialTimes && initialTimes.length > 0) {
      const sorted = [...initialTimes].sort()
      setTimes(sorted)
      setTimeInput(sorted[0])
    } else {
      setTimes([])
      setTimeInput('')
      setTimeLeft('Выберите время')
    }
  }, [initialTimes])

  // Обновляем ref при изменении значений
  useEffect(() => {
    currentValuesRef.current = {
      timeInput,
      times,
      value,
      metricType,
    }
    
    // Отмечаем, что есть несохраненное время, если пользователь выбрал время, но не нажал плюс
    if (timeInput && timeInput.trim() !== '' && !times.includes(timeInput)) {
      hasUnsavedTimeRef.current = true
    } else if (timeInput === '' || times.includes(timeInput)) {
      hasUnsavedTimeRef.current = false
    }
  }, [timeInput, times, value, metricType])

  // Сохранение при размонтировании компонента (переход на другую вкладку)
  useEffect(() => {
    const saveOnUnmount = () => {
      // Используем актуальные значения из ref
      const current = currentValuesRef.current
      if (hasUnsavedTimeRef.current && current.timeInput && current.timeInput.trim() !== '' && !current.times.includes(current.timeInput)) {
        const updatedTimes = Array.from(new Set([...current.times, current.timeInput])).sort()
        
        // ВАЖНО: При размонтировании сохраняем ТОЛЬКО настройки времени, БЕЗ значения
        // Это предотвращает дублирование значений при закрытии панели
        const data: MetricFillData = {
          value: '', // Пустое значение при размонтировании
          frequency: updatedTimes.length,
          reminderStart: updatedTimes[0] ?? '',
          reminderEnd: updatedTimes[updatedTimes.length - 1] ?? '',
          times: updatedTimes,
        }
        
        try {
          // Пытаемся сохранить синхронно
          onSave(current.metricType, data)
        } catch (error) {
          console.error('Ошибка сохранения при размонтировании:', error)
        }
      }
    }

    // Обработка события beforeunload (закрытие вкладки/браузера)
    const handleBeforeUnload = () => {
      saveOnUnmount()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // При размонтировании компонента также сохраняем
      saveOnUnmount()
    }
  }, [onSave])

  const handleSave = async () => {
    // Если есть несохраненное время в timeInput, добавляем его
    let finalTimes = [...times]
    if (timeInput && timeInput.trim() !== '' && !finalTimes.includes(timeInput)) {
      finalTimes = Array.from(new Set([...finalTimes, timeInput])).sort()
      setTimes(finalTimes)
    }

    const sanitizedTimes = finalTimes.length > 0 ? Array.from(new Set(finalTimes)).sort() : []

    const noValue = value.trim() === ''
    const timesUnchanged =
      sanitizedTimes.length === initialTimesNormalized.length &&
      sanitizedTimes.every((time, index) => time === initialTimesNormalized[index])

    if (noValue && timesUnchanged) {
      onClose()
      return
    }

    const data: MetricFillData = {
      value,
      frequency: sanitizedTimes.length,
      reminderStart: sanitizedTimes[0] ?? '',
      reminderEnd: sanitizedTimes[sanitizedTimes.length - 1] ?? '',
      times: sanitizedTimes,
    }
    
    try {
      await onSave(metricType, data)
      hasUnsavedTimeRef.current = false
      // Сброс значений
      setValue('')
      setTimes(sanitizedTimes)
      setTimeInput(sanitizedTimes[0] ?? '')
    } catch (error) {
      console.error('Ошибка сохранения:', error)
    }
  }

  const sortedTimes = useMemo(() => {
    if (times.length === 0) {
      return []
    }
    return Array.from(new Set(times)).sort()
  }, [times])

  const calculateTimeLeft = () => {
    if (sortedTimes.length === 0) {
      setTimeLeft('Выберите время')
      return
    }

    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    const nextTimeString = sortedTimes.find(time => {
      const [h, m] = time.split(':').map(Number)
      const minutes = h * 60 + m
      return minutes > currentMinutes
    })

    let diffMinutes: number
    if (nextTimeString) {
      const [h, m] = nextTimeString.split(':').map(Number)
      diffMinutes = h * 60 + m - currentMinutes
    } else {
      const [h, m] = sortedTimes[0].split(':').map(Number)
      diffMinutes = h * 60 + m + (24 * 60 - currentMinutes)
    }

    const hours = Math.floor(diffMinutes / 60)
    const minutes = diffMinutes % 60
    const formatted =
      (hours ? `${String(hours).padStart(2, '0')}:` : '00:') + String(minutes).padStart(2, '0')
    setTimeLeft(formatted)
  }

  useEffect(() => {
    calculateTimeLeft()
    const interval = setInterval(calculateTimeLeft, 60 * 1000)
    return () => clearInterval(interval)
  }, [sortedTimes])

  const displayValue = lastValue || '--'
  const windowWidth = useWindowWidth()
  const isSmallScreen = windowWidth < 388

  return (
    <div
      className="bg-gradient-to-br from-[#61B4C6] to-[#317799] rounded-2xl text-white shadow-md grid gap-3 overflow-hidden h-full"
      style={{
        gridTemplateColumns: isSmallScreen ? 'clamp(80px, calc((100% - 16px) / 3), 120px) 1fr' : 'calc((100% - 24px) / 3) 1fr',
        minHeight: isSmallScreen ? '120px' : '140px',
        padding: isSmallScreen ? '8px' : '12px',
        borderRadius: isSmallScreen ? '12px' : '16px',
        gap: isSmallScreen ? '8px' : '12px',
      }}
    >
      {/* Левая часть — идентична закрытой карточке */}
      <div
        className="flex flex-col items-center text-white text-center h-full justify-between min-w-0"
        style={{ fontFamily: 'Manrope, sans-serif' }}
      >
        <div
          className="text-base font-bold w-full text-center mb-2"
          style={{
            minHeight: isSmallScreen ? '32px' : '38px',
            lineHeight: '1.1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: isSmallScreen ? '12px' : '16px',
          }}
        >
          {metricLabel}
        </div>

        <div className="flex items-center justify-center w-full" style={{ height: isSmallScreen ? '70px' : '90px' }}>
          <div className="relative flex items-center justify-center" style={{ 
            width: isSmallScreen ? '70px' : '100px', 
            height: isSmallScreen ? '70px' : '100px', 
            minWidth: isSmallScreen ? '70px' : '100px', 
            minHeight: isSmallScreen ? '70px' : '100px' 
          }}>
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="url(#circleGradient)"
                opacity="0.85"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="#ffffff"
                strokeOpacity="0.35"
                strokeWidth="6"
                strokeDasharray="8 8"
              />
              <defs>
                <radialGradient id="circleGradient" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
                </radialGradient>
              </defs>
            </svg>
            <div
              className="relative z-10 flex items-center justify-center text-center"
              style={{
                fontFamily: 'Manrope, sans-serif',
                fontWeight: 800,
                fontSize: typeof displayValue === 'string' && displayValue.length <= 5
                  ? (isSmallScreen ? '24px' : '32px')
                  : typeof displayValue === 'string' && displayValue.length <= 8
                  ? (isSmallScreen ? '20px' : '28px')
                  : (isSmallScreen ? '16px' : '22px'),
                color: '#FFFFFF',
                textShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                minWidth: isSmallScreen ? '48px' : '64px',
                padding: isSmallScreen ? '0 4px' : '0 6px',
                wordBreak: 'break-word',
              }}
            >
              {displayValue}
            </div>
          </div>
        </div>

        <div className="w-full space-y-1.5 mt-2">
          <div className="text-xs opacity-90 text-center" style={{ fontSize: isSmallScreen ? '10px' : '12px' }}>
            {times.length === 0 ? 'Выберите время' : `Заполнить через: ${timeLeft}`}
          </div>
          <button
            onClick={handleSave}
            className="w-full text-xs text-white py-1.5 bg-[#4A4A4A] rounded-xl"
            style={{ 
              borderRadius: '12px',
              fontSize: isSmallScreen ? '10px' : '12px',
              paddingTop: isSmallScreen ? '4px' : '6px',
              paddingBottom: isSmallScreen ? '4px' : '6px',
            }}
          >
            Сохранить
          </button>
        </div>
      </div>

      {/* Правая часть */}
      <div className="flex flex-col justify-between gap-1.5 min-w-0 h-full">
        <div className="rounded-2xl bg-gradient-to-r from-[#7DCAD6] to-[#55ACBF] px-3 py-1.5 w-full" style={{
          borderRadius: isSmallScreen ? '12px' : '16px',
          padding: isSmallScreen ? '8px 12px' : '12px',
        }}>
          <p className="text-[11px] font-semibold mb-1" style={{ 
            fontFamily: 'Manrope, sans-serif',
            fontSize: isSmallScreen ? '10px' : '11px',
            marginBottom: isSmallScreen ? '4px' : '4px',
          }}>
            Заполните:
          </p>
          <Input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Внесите замер"
            className="w-full bg-white text-[#4A4A4A] text-xs h-7 rounded-xl px-2.5"
            style={{
              fontSize: isSmallScreen ? '10px' : '12px',
              height: isSmallScreen ? '24px' : '28px',
              padding: isSmallScreen ? '4px 10px' : '6px 10px',
              borderRadius: isSmallScreen ? '10px' : '12px',
            }}
          />
        </div>

        <div className="rounded-2xl bg-gradient-to-r from-[#7DCAD6] to-[#55ACBF] px-3 py-1.5 w-full space-y-2" style={{
          borderRadius: isSmallScreen ? '12px' : '16px',
          padding: isSmallScreen ? '8px 12px' : '12px',
          gap: isSmallScreen ? '8px' : '8px',
        }}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold" style={{ 
              fontFamily: 'Manrope, sans-serif',
              fontSize: isSmallScreen ? '10px' : '11px',
            }}>
              Время заполнения:
            </p>
            <span className="text-[11px] opacity-80 whitespace-nowrap" style={{ 
              fontFamily: 'Manrope, sans-serif',
              fontSize: isSmallScreen ? '10px' : '11px',
            }}>
              {sortedTimes.length} {sortedTimes.length === 1 ? 'раз в день' : 'раза в день'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {sortedTimes.map(time => (
              <span
                key={time}
                className="inline-flex items-center gap-1 bg-white text-[#4A4A4A] text-xs px-2.5 py-1 rounded-xl"
                style={{
                  fontSize: isSmallScreen ? '10px' : '12px',
                  padding: isSmallScreen ? '4px 10px' : '4px 10px',
                  borderRadius: isSmallScreen ? '10px' : '12px',
                  gap: isSmallScreen ? '4px' : '4px',
                }}
              >
                {time}
                <button
                  type="button"
                  onClick={() =>
                    setTimes(prev => {
                      const updated = prev.filter(t => t !== time)
                      if (updated.length === 0) {
                        setTimeInput('')
                        return []
                      }
                      if (!updated.includes(timeInput)) {
                        setTimeInput(updated[0])
                      }
                      return updated
                    })
                  }
                  className="text-[#4A4A4A] text-xs leading-none"
                  style={{ fontSize: isSmallScreen ? '10px' : '12px' }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              className="bg-white text-[#4A4A4A] text-xs h-7 rounded-xl px-2.5 flex-1"
              style={{
                fontSize: isSmallScreen ? '10px' : '12px',
                height: isSmallScreen ? '24px' : '28px',
                padding: isSmallScreen ? '4px 10px' : '6px 10px',
                borderRadius: isSmallScreen ? '10px' : '12px',
              }}
            />
            <button
              type="button"
              onClick={async () => {
                if (!timeInput) return
                const updatedTimes = Array.from(new Set([...times, timeInput])).sort()
                setTimes(updatedTimes)
                setTimeInput('')
                
                // Сбрасываем флаг несохраненного времени, так как сейчас сохраняем
                hasUnsavedTimeRef.current = false
                
                // Сохраняем время сразу при нажатии на "+"
                // ВАЖНО: Сохраняем ТОЛЬКО настройки времени, БЕЗ значения, чтобы избежать дублирования
                // Значение будет сохранено только при нажатии на кнопку "Сохранить"
                const data: MetricFillData = {
                  value: '', // Пустое значение при добавлении времени
                  frequency: updatedTimes.length,
                  reminderStart: updatedTimes[0] ?? '',
                  reminderEnd: updatedTimes[updatedTimes.length - 1] ?? '',
                  times: updatedTimes,
                }
                // Вызываем onSave для сохранения только настроек времени в БД
                try {
                  await onSave(metricType, data)
                } catch (error) {
                  console.error('Ошибка сохранения времени:', error)
                }
              }}
              className="bg-[#A0D9E3] text-[#4A4A4A] text-xl font-bold rounded-xl flex items-center justify-center p-0 border-0 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
              style={{
                width: isSmallScreen ? '28px' : '35px',
                height: isSmallScreen ? '28px' : '35px',
                fontSize: isSmallScreen ? '18px' : '24px',
                borderRadius: isSmallScreen ? '10px' : '12px',
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

