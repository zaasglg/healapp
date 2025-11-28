import { useEffect, useMemo, useState } from 'react'
import { getFunctionUrl } from '@/utils/supabaseConfig'

const getMetricLabel = (metricType: string): string => {
  const labels: Record<string, string> = {
    walk: 'Прогулка',
    cognitive_games: 'Когнитивные игры',
    diaper_change: 'Смена подгузников',
    hygiene: 'Гигиена',
    skin_moisturizing: 'Увлажнение кожи',
    meal: 'Прием пищи',
    medications: 'Прием лекарств',
    vitamins: 'Прием витаминов',
    sleep: 'Сон',
    temperature: 'Температура',
    blood_pressure: 'Давление',
    breathing_rate: 'Частота дыхания',
    pain_level: 'Уровень боли',
    saturation: 'Сатурация',
    blood_sugar: 'Уровень сахара',
    urination: 'Выделение мочи',
    defecation: 'Дефекация',
    nausea: 'Тошнота',
    vomiting: 'Рвота',
    shortness_of_breath: 'Одышка',
    itching: 'Зуд',
    cough: 'Кашель',
    dry_mouth: 'Сухость во рту',
    hiccups: 'Икота',
    taste_disturbance: 'Нарушение вкуса',
    support_note: 'Запись поддержки',
  }
  return labels[metricType] || metricType
}

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  })

const buildWeekBuckets = (days: number = 7) => {
  const buckets: Array<{ key: string; date: Date; label: string; value: number }> = []
  const map = new Map<string, { key: string; date: Date; label: string; value: number }>()
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(now.getDate() - i)
    const key = date.toISOString().slice(0, 10)
    const bucket = { key, date, label: formatDateLabel(date), value: 0 }
    buckets.push(bucket)
    map.set(key, bucket)
  }
  return { buckets, map }
}

type ChartPoint = { label: string; value: number }

const LineChart = ({
  data,
  height = 380,
  color = '#0A6D83',
}: {
  data: ChartPoint[]
  height?: number
  color?: string
}) => {
  const width = 640 // виртуальная ширина, будет масштабироваться через viewBox
  const padding = { top: 24, right: 24, bottom: 96, left: 68 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const maxValue = Math.max(...data.map(d => d.value), 1)
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: number } | null>(null)

  const points = data.map((d, i) => {
    const x = padding.left + i * stepX
    const y =
      padding.top + (maxValue === 0 ? innerH : innerH - Math.max(0, Math.min(1, d.value / maxValue)) * innerH)
    return { x, y, v: d.value, label: d.label }
  })

  const pathD =
    points.length > 0
      ? `M ${points[0].x},${points[0].y} ` + points.slice(1).map(p => `L ${p.x},${p.y}`).join(' ')
      : ''

  // Y‑оси тики: 0, 25%, 50%, 75%, 100%
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: padding.top + innerH - t * innerH,
    v: Math.round(maxValue * t),
  }))

  return (
    <div className="w-full relative">
      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bg-white text-xs text-gray-700 border border-gray-200 shadow-md rounded-md px-2 py-1 pointer-events-none"
          style={{
            left: `calc(${(tooltip.x / width) * 100}% - 40px)`,
            top: Math.max(0, ((tooltip.y - 28) / height) * 100) + '%',
          }}
        >
          <div className="font-medium">{tooltip.value}</div>
          <div className="text-gray-500">{tooltip.label}</div>
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-96">
        {/* Оси */}
        <line x1={padding.left} y1={padding.top + innerH} x2={padding.left + innerW} y2={padding.top + innerH} stroke="#E5E7EB" strokeWidth={2} />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerH} stroke="#E5E7EB" strokeWidth={2} />
        {/* Сетки по Y */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padding.left} y1={t.y} x2={padding.left + innerW} y2={t.y} stroke="#E9EEF5" />
            <text x={padding.left - 14} y={t.y + 10} textAnchor="end" fontSize="20" fontWeight="800" fill="#0F172A">
              {t.v}
            </text>
          </g>
        ))}
        {/* Линия */}
        <path d={pathD} fill="none" stroke={color} strokeWidth={4} />
        {/* Точки */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={7}
              fill={color}
              className="cursor-pointer"
              onClick={() => setTooltip({ x: p.x, y: p.y, label: p.label, value: p.v })}
            />
            {/* Метки X */}
            <text x={p.x} y={padding.top + innerH + 30} textAnchor="middle" fontSize="20" fontWeight="800" fill="#0F172A">
              {p.label}
            </text>
            <text x={p.x} y={padding.top + innerH + 56} textAnchor="middle" fontSize="20" fill="#0F172A">
              {p.v}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export const AdminMonitoringPage = () => {
  const [_isLoading, setIsLoading] = useState(true)
  void _isLoading // Prevent unused variable warning
  const [periodDays, setPeriodDays] = useState<7 | 30>(7)
  const [supabaseData, setSupabaseData] = useState<{
    diaries: any[]
    patientCards: any[]
    organizations: any[]
    userProfiles: any[]
    clients: any[]
    employees: any[]
    history: any[]
    metricValues: any[]
  }>({
    diaries: [],
    patientCards: [],
    organizations: [],
    userProfiles: [],
    clients: [],
    employees: [],
    history: [],
    metricValues: [],
  })

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true)

        const adminToken = localStorage.getItem('admin_token') || 'b8f56f5c-62f1-45d9-9e5a-e8bbfdadcf0f'
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

        if (!supabaseAnonKey) {
          console.error('Не настроены переменные окружения Supabase')
          setIsLoading(false)
          return
        }

        // Используем утилиту для получения правильного URL функций
        const functionUrl = getFunctionUrl('admin-support-data')
        const response = await fetch(`${functionUrl}?admin_token=${encodeURIComponent(adminToken)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseAnonKey}`,
            apikey: supabaseAnonKey,
          },
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Неизвестная ошибка' }))
          console.error('Ошибка загрузки данных для мониторинга:', errorData)
          setIsLoading(false)
          return
        }

        const result = await response.json()
        if (!result.success || !result.data) {
          console.error('Неверный формат ответа от Edge Function admin-support-data')
          setIsLoading(false)
          return
        }

        setSupabaseData({
          diaries: result.data.diaries || [],
          patientCards: result.data.patientCards || [],
          organizations: result.data.organizations || [],
          userProfiles: result.data.userProfiles || [],
          clients: result.data.clients || [],
          employees: result.data.employees || [],
          history: result.data.history || [],
          metricValues: result.data.metricValues || [],
        })
      } catch (error) {
        console.error('Ошибка загрузки данных мониторинга из Supabase:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  const diaries = useMemo(() => supabaseData.diaries, [supabaseData.diaries])
  const patientCards = useMemo(() => supabaseData.patientCards, [supabaseData.patientCards])
  const organizations = useMemo(() => supabaseData.organizations, [supabaseData.organizations])
  const clients = useMemo(() => supabaseData.clients, [supabaseData.clients])
  const historyRows = useMemo(() => supabaseData.history, [supabaseData.history])
  const metricRows = useMemo(() => supabaseData.metricValues, [supabaseData.metricValues])
  const usersCountFromProfiles = useMemo(
    () => supabaseData.userProfiles.length + supabaseData.clients.length + supabaseData.employees.length,
    [supabaseData.userProfiles, supabaseData.clients, supabaseData.employees]
  )

  const diariesCreatedChart = useMemo(() => {
    const { buckets, map } = buildWeekBuckets(periodDays)
    diaries.forEach((diary: any) => {
      const createdAt = diary?.created_at
      if (!createdAt) return
      const key = new Date(createdAt).toISOString().slice(0, 10)
      const bucket = map.get(key)
      if (bucket) {
        bucket.value += 1
      }
    })
    return buckets
  }, [diaries, periodDays])

  const entriesActivityChart = useMemo(() => {
    const { buckets, map: _map } = buildWeekBuckets(periodDays)
    void _map // Prevent unused variable warning
    const daySets = new Map<string, Set<string>>()
    buckets.forEach(bucket => {
      daySets.set(bucket.key, new Set<string>())
    })

    historyRows.forEach((entry: any) => {
      if (!entry?.occurred_at || !entry?.diary_id) return
      const key = new Date(entry.occurred_at).toISOString().slice(0, 10)
      const set = daySets.get(key)
      if (set) {
        set.add(String(entry.diary_id))
      }
    })

    metricRows.forEach((metric: any) => {
      if (!metric?.recorded_at || !metric?.diary_id) return
      const key = new Date(metric.recorded_at).toISOString().slice(0, 10)
      const set = daySets.get(key)
      if (set) {
        set.add(String(metric.diary_id))
      }
    })

    buckets.forEach(bucket => {
      const set = daySets.get(bucket.key)
      bucket.value = set ? set.size : 0
    })

    return buckets
  }, [historyRows, metricRows, periodDays])

  const stats = useMemo(() => {
    const diariesCount = diaries.length
    const cardsCount = patientCards.length
    const usersCount = usersCountFromProfiles
    const orgCount = organizations.length

    const totalEntries = historyRows.length + metricRows.length

    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    let todayEntries = 0
    historyRows.forEach((entry: any) => {
      if (entry?.occurred_at) {
        const ts = new Date(entry.occurred_at).getTime()
        if (ts >= startOfToday) todayEntries += 1
      }
    })
    metricRows.forEach((metric: any) => {
      if (metric?.recorded_at) {
        const ts = new Date(metric.recorded_at).getTime()
        if (ts >= startOfToday) todayEntries += 1
      }
    })

    return {
      diariesCount,
      cardsCount,
      usersCount,
      orgCount,
      totalEntries,
      todayEntries,
      created7Days: diariesCreatedChart.reduce((acc, day) => acc + day.value, 0),
      activeDiaries7Days: entriesActivityChart.reduce((acc, day) => acc + day.value, 0),
    }
  }, [diaries, patientCards, usersCountFromProfiles, organizations, historyRows, metricRows, diariesCreatedChart, entriesActivityChart])

  const _recentChanges = useMemo(() => {
    const changes: Array<{ id: string; timestamp: string; action: string; details: string; diaryId?: string }> = []

    historyRows.forEach((entry: any) => {
      if (!entry?.occurred_at) return
      changes.push({
        id: `history_${entry.id}`,
        timestamp: entry.occurred_at,
        action: 'diary_history',
        details: getMetricLabel(entry.metric_type || 'support_note'),
        diaryId: entry.diary_id,
      })
    })

    metricRows.forEach((metric: any) => {
      if (!metric?.recorded_at) return
      changes.push({
        id: `metric_${metric.id}`,
        timestamp: metric.recorded_at,
        action: 'metric_value',
        details: getMetricLabel(metric.metric_type),
        diaryId: metric.diary_id,
      })
    })

    return changes
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 6)
  }, [historyRows, metricRows])
  void _recentChanges // Prevent unused variable warning

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-800">Мониторинг и статистика</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPeriodDays(7)}
            className={`px-3 py-1 rounded-full text-sm border ${periodDays === 7 ? 'bg-[#0A6D83] text-white border-[#0A6D83]' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            7 дней
          </button>
          <button
            type="button"
            onClick={() => setPeriodDays(30)}
            className={`px-3 py-1 rounded-full text-sm border ${periodDays === 30 ? 'bg-[#0A6D83] text-white border-[#0A6D83]' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            30 дней
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { title: 'Активные дневники', value: stats.diariesCount },
          { title: 'Карточки подопечных', value: stats.cardsCount },
          { title: 'Пользователи и сотрудники', value: stats.usersCount },
          { title: 'Организации', value: stats.orgCount },
          { title: 'Новых дневников за 7 дней', value: stats.created7Days },
          { title: 'Активных дневников за 7 дней', value: stats.activeDiaries7Days },
          { title: 'Записей сегодня', value: stats.todayEntries },
        ].map(card => (
          <div key={card.title} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
            <p className="text-xs uppercase text-gray-400">{card.title}</p>
            <p className="text-2xl font-semibold text-[#0A6D83] mt-2">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">Новые дневники за {periodDays} дней</h3>
            <span className="text-xs text-gray-400">Всего: {stats.created7Days}</span>
          </div>
          <LineChart data={diariesCreatedChart} />
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">Активные дневники за {periodDays} дней</h3>
            <span className="text-xs text-gray-400">Всего: {stats.activeDiaries7Days}</span>
          </div>
          <LineChart data={entriesActivityChart} />
          <p className="text-xs text-gray-500">
            Учитываются дневники, где за день была внесена минимум одна запись (любой показатель).
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-3">
          <h3 className="text-lg font-semibold text-gray-800">Топ неактивных дневников</h3>
          <p className="text-xs text-gray-500">
            Дневники без записей за последние {periodDays} дней. Помогает выявлять риски оттока.
          </p>
          <div className="space-y-2">
            {(() => {
              const now = Date.now()
              // Собираем по каждому дневнику дату последней активности
              const lastByDiary = new Map<string, number>()
              historyRows.forEach((h: any) => {
                if (!h?.diary_id || !h?.occurred_at) return
                const ts = new Date(h.occurred_at).getTime()
                const key = String(h.diary_id)
                lastByDiary.set(key, Math.max(lastByDiary.get(key) || 0, ts))
              })
              metricRows.forEach((m: any) => {
                if (!m?.diary_id || !m?.recorded_at) return
                const ts = new Date(m.recorded_at).getTime()
                const key = String(m.diary_id)
                lastByDiary.set(key, Math.max(lastByDiary.get(key) || 0, ts))
              })

              // Готовим список с метриками «без активности N дней»
              const items = diaries.map((d: any) => {
                const lastTs = lastByDiary.get(String(d.id)) || 0
                const createdTs = d?.created_at ? new Date(d.created_at).getTime() : 0
                const baseTs = lastTs || createdTs
                const daysInactive = baseTs ? Math.floor((now - baseTs) / (1000 * 60 * 60 * 24)) : periodDays + 1
                return {
                  id: d.id,
                  name: d.name || d.id,
                  lastAt: lastTs ? new Date(lastTs) : null,
                  daysInactive,
                }
              })
              // Фильтруем по выбранному периоду и сортируем по убыванию «застоя»
              const inactive = items
                .filter(x => x.daysInactive >= periodDays)
                .sort((a, b) => b.daysInactive - a.daysInactive)
                .slice(0, 8)

              if (inactive.length === 0) {
                return <p className="text-sm text-gray-500">За выбранный период нет неактивных дневников.</p>
              }

              return inactive.map(item => {
                const diary = diaries.find((d: any) => d.id === item.id) || {}
                const org = organizations.find((o: any) => o.id === diary.organization_id)
                const client = clients.find((c: any) => c.id === diary.client_id)
                const profile = supabaseData.userProfiles?.find((u: any) => u.user_id === diary.owner_id || u.id === diary.user_id)
                const orgName = org?.name || 'Без организации'
                const phone =
                  org?.phone ||
                  org?.contact_phone ||
                  client?.phone ||
                  client?.contact_phone ||
                  profile?.phone ||
                  profile?.contact_phone ||
                  '—'
                return (
                  <div key={item.id} className="bg-[#F7FCFD] rounded-2xl px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{item.name}</p>
                        <p className="text-xs text-gray-500 truncate">Организация: {orgName}</p>
                        <p className="text-xs text-gray-500">Телефон: {phone}</p>
                        <p className="text-xs text-gray-500">
                          Последняя активность: {item.lastAt ? item.lastAt.toLocaleDateString('ru-RU') : 'не было'}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-[#8A3A0A] bg-[#FDF3E7] px-3 py-1 rounded-full">
                        {item.daysInactive} дн. без записей
                      </span>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}


