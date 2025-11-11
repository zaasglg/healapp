import { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'

interface MetricFillModalProps {
  isOpen: boolean
  onClose: () => void
  metricType: string
  metricLabel: string
  onSave: (data: MetricFillData) => void
}

export interface MetricFillData {
  value: string | number | boolean
  frequency: number // количество раз в день
  reminderStart: string // время начала напоминаний (HH:MM)
  reminderEnd: string // время окончания напоминаний (HH:MM)
  times: string[]
}

export const MetricFillModal = ({
  isOpen,
  onClose,
  metricType,
  metricLabel,
  onSave,
}: MetricFillModalProps) => {
  const [value, setValue] = useState<string>('')
  const [frequency, setFrequency] = useState<number>(1)
  const [reminderStart, setReminderStart] = useState<string>('09:00')
  const [reminderEnd, setReminderEnd] = useState<string>('21:00')

  useEffect(() => {
    if (!isOpen) {
      // Сброс значений при закрытии
      setValue('')
      setFrequency(1)
      setReminderStart('09:00')
      setReminderEnd('21:00')
    }
  }, [isOpen])

  const handleSave = () => {
    const data: MetricFillData = {
      value,
      frequency,
      reminderStart,
      reminderEnd,
      times: calculateReminderTimes(),
    }
    onSave(data)
    onClose()
  }

  const calculateReminderTimes = () => {
    if (frequency === 1) return [reminderStart]
    
    const start = reminderStart.split(':').map(Number)
    const end = reminderEnd.split(':').map(Number)
    const startMinutes = start[0] * 60 + start[1]
    const endMinutes = end[0] * 60 + end[1]
    const totalMinutes = endMinutes - startMinutes
    const interval = Math.floor(totalMinutes / (frequency - 1))
    
    const times: string[] = []
    for (let i = 0; i < frequency; i++) {
      const minutes = startMinutes + (i * interval)
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      times.push(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`)
    }
    return times
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-50 animate-fadeIn">
      <div 
        className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl animate-slideUp overflow-y-auto"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#7DD3DC] to-[#5CBCC7] px-6 py-4 rounded-t-3xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">{metricLabel}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white bg-opacity-20 hover:bg-opacity-30 transition-all"
            >
              <span className="text-white text-2xl leading-none">×</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Блок заполнения параметра */}
          <div className="bg-white rounded-2xl border-2 border-[#7DD3DC] p-5">
            <h3 className="text-base font-bold text-[#4A4A4A] mb-3">Заполнение параметра</h3>
            <Input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Введите значение"
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-2">
              Время заполнения: {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {/* Блок выбора частоты заполнения */}
          <div className="bg-white rounded-2xl border-2 border-[#7DD3DC] p-5">
            <h3 className="text-base font-bold text-[#4A4A4A] mb-3">Заполнять раз в</h3>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1"
                max="24"
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
                className="w-20 text-center"
              />
              <span className="text-[#4A4A4A] font-medium">
                {frequency === 1 ? 'раз' : frequency >= 2 && frequency <= 4 ? 'раза' : 'раз'} в день
              </span>
            </div>
          </div>

          {/* Блок напоминаний */}
          <div className="bg-white rounded-2xl border-2 border-[#7DD3DC] p-5">
            <h3 className="text-base font-bold text-[#4A4A4A] mb-3">Напоминания</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-[#4A4A4A] w-12">С</label>
                <Input
                  type="time"
                  value={reminderStart}
                  onChange={(e) => setReminderStart(e.target.value)}
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-[#4A4A4A] w-12">ДО</label>
                <Input
                  type="time"
                  value={reminderEnd}
                  onChange={(e) => setReminderEnd(e.target.value)}
                  className="flex-1"
                />
              </div>
              
              {/* Расчетное время напоминаний */}
              {frequency > 1 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-600 mb-2">Расчетное время напоминаний:</p>
                  <div className="flex flex-wrap gap-2">
                    {calculateReminderTimes().map((time, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-[#A0E7E5] text-[#4A4A4A] rounded-full text-xs font-medium"
                      >
                        {time}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Блок ИИ оценки */}
          <div className="bg-gradient-to-br from-[#A0E7E5] to-[#7DD3DC] rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-white bg-opacity-30 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white mb-2">Оценка ИИ помощника</h3>
                <p className="text-sm text-white opacity-90">
                  Слишком мало данных для анализа, идет сбор
                </p>
              </div>
            </div>
          </div>

          {/* Кнопка сохранения */}
          <Button
            onClick={handleSave}
            className="w-full !bg-gradient-to-r !from-[#7DD3DC] !to-[#5CBCC7] !text-white font-bold py-4 !rounded-3xl text-base shadow-lg"
          >
            Сохранить
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  )
}

