import { useEffect, useMemo, useState } from 'react'
import { Button, Input } from '@/components/ui'
import type { MetricFillData } from '@/components/MetricFillModal'

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

  const handleSave = () => {
    const sanitizedTimes =
      times.length > 0 ? Array.from(new Set(times)).sort() : []

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
    onSave(metricType, data)
    // Сброс значений
    setValue('')
    setTimes(sanitizedTimes)
    setTimeInput(sanitizedTimes[0] ?? '')
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

  return (
    <div
      className="bg-gradient-to-br from-[#61B4C6] to-[#317799] rounded-2xl p-3 text-white shadow-md grid gap-3 overflow-hidden h-full"
      style={{
        gridTemplateColumns: 'calc((100% - 24px) / 3) 1fr',
        minHeight: '140px',
      }}
    >
      {/* Левая часть — идентична закрытой карточке */}
      <div
        className="flex flex-col items-center text-white text-center h-full justify-between"
        style={{ fontFamily: 'Manrope, sans-serif' }}
      >
        <div
          className="text-base font-bold w-full text-center mb-2"
          style={{
            minHeight: '38px',
            lineHeight: '1.1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {metricLabel}
        </div>

        <div className="flex items-center justify-center w-full" style={{ height: '90px' }}>
          <div className="relative flex items-center justify-center" style={{ width: '100px', height: '100px' }}>
            <svg className="absolute inset-0" width="100" height="100" viewBox="0 0 100 100">
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
                fontSize:
                  typeof displayValue === 'string' && displayValue.length <= 5
                    ? '32px'
                    : typeof displayValue === 'string' && displayValue.length <= 8
                    ? '28px'
                    : '22px',
                color: '#FFFFFF',
                textShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                minWidth: '64px',
                padding: '0 6px',
                wordBreak: 'break-word',
              }}
            >
              {displayValue}
            </div>
          </div>
        </div>

        <div className="w-full space-y-1.5 mt-2">
          <div className="text-xs opacity-90 text-center">
            {times.length === 0 ? 'Выберите время' : `Заполнить через: ${timeLeft}`}
          </div>
          <button
            onClick={handleSave}
            className="w-full text-xs text-white py-1.5 bg-[#4A4A4A] rounded-xl"
            style={{ borderRadius: '12px' }}
          >
            Сохранить
          </button>
        </div>
      </div>

      {/* Правая часть */}
      <div className="flex flex-col justify-between gap-1.5 min-w-0 h-full">
        <div className="rounded-2xl bg-gradient-to-r from-[#7DCAD6] to-[#55ACBF] px-3 py-1.5 w-full">
          <p className="text-[11px] font-semibold mb-1" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Заполните:
          </p>
          <Input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Заполните параметр"
            className="w-full bg-white text-[#4A4A4A] text-xs h-7 rounded-xl px-2.5"
          />
        </div>

        <div className="rounded-2xl bg-gradient-to-r from-[#7DCAD6] to-[#55ACBF] px-3 py-1.5 w-full space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Время заполнения:
            </p>
            <span className="text-[11px] opacity-80" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {sortedTimes.length} {sortedTimes.length === 1 ? 'раз в день' : 'раза в день'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {sortedTimes.map(time => (
              <span
                key={time}
                className="inline-flex items-center gap-1 bg-white text-[#4A4A4A] text-xs px-2.5 py-1 rounded-xl"
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
                  className="text-[#4A4A4A] text-xs"
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
            />
            <Button
              type="button"
              onClick={() => {
                if (!timeInput) return
                setTimes(prev => Array.from(new Set([...prev, timeInput])).sort())
                setTimeInput('')
              }}
              className="!bg-white !text-[#4A4A4A] text-xs px-3 py-2 rounded-xl"
            >
              +
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

