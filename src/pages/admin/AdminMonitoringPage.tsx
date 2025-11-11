import { useMemo } from 'react'
const safeString = (value: any) => (value === undefined || value === null ? '' : String(value))

const readArray = (keys: string[]): any[] => {
  for (const key of keys) {
    if (!key) continue
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
      }
    } catch (error) {
      console.warn(`Не удалось прочитать ${key}`, error)
    }
  }
  return []
}

const readObject = (key: string): Record<string, any> => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch (error) {
    console.warn(`Не удалось прочитать ${key}`, error)
  }
  return {}
}

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

const buildWeekBuckets = () => {
  const buckets: Array<{ key: string; date: Date; label: string; value: number }> = []
  const map = new Map<string, { key: string; date: Date; label: string; value: number }>()
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(now.getDate() - i)
    const key = date.toISOString().slice(0, 10)
    const bucket = { key, date, label: formatDateLabel(date), value: 0 }
    buckets.push(bucket)
    map.set(key, bucket)
  }
  return { buckets, map }
}

export const AdminMonitoringPage = () => {
  const diaries = useMemo(() => readArray(['diaries']), [])
  const patientCards = useMemo(() => readArray(['patient_cards']), [])
  const users = useMemo(() => readArray(['local_users']), [])
  const clients = useMemo(() => readArray(['local_clients']), [])
  const employees = useMemo(() => readArray(['local_employees']), [])
  const organizations = useMemo(() => readArray(['organizations', 'admin_organizations']), [])
  const historyStorage = useMemo(() => readObject('diary_history'), [])
  const supportLogs = useMemo(() => readArray(['admin_support_audit']), [])

  const diariesCreatedChart = useMemo(() => {
    const { buckets, map } = buildWeekBuckets()
    diaries.forEach(diary => {
      const createdAt = diary?.created_at
      if (!createdAt) return
      const key = new Date(createdAt).toISOString().slice(0, 10)
      const bucket = map.get(key)
      if (bucket) {
        bucket.value += 1
      }
    })
    return buckets
  }, [diaries])

  const entriesActivityChart = useMemo(() => {
    const { buckets, map } = buildWeekBuckets()
    const daySets = new Map<string, Set<string>>()
    buckets.forEach(bucket => {
      daySets.set(bucket.key, new Set<string>())
    })

    Object.entries(historyStorage).forEach(([diaryId, value]) => {
      if (!Array.isArray(value)) return
      value.forEach((entry: any) => {
        if (!entry?.created_at) return
        const key = new Date(entry.created_at).toISOString().slice(0, 10)
        const set = daySets.get(key)
        if (set) {
          set.add(diaryId)
        }
      })
    })

    buckets.forEach(bucket => {
      const set = daySets.get(bucket.key)
      bucket.value = set ? set.size : 0
    })

    return buckets
  }, [historyStorage])

  const stats = useMemo(() => {
    const diariesCount = diaries.length
    const cardsCount = patientCards.length
    const usersCount = users.length + clients.length + employees.length
    const orgCount = organizations.length

    let totalEntries = 0
    Object.values(historyStorage).forEach(value => {
      if (Array.isArray(value)) {
        totalEntries += value.length
      }
    })

    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    let todayEntries = 0
    Object.values(historyStorage).forEach(value => {
      if (Array.isArray(value)) {
        value.forEach((entry: any) => {
          if (entry?.created_at) {
            const ts = new Date(entry.created_at).getTime()
            if (ts >= startOfToday) todayEntries += 1
          }
        })
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
  }, [
    diaries,
    patientCards,
    users,
    clients,
    employees,
    organizations,
    historyStorage,
    diariesCreatedChart,
    entriesActivityChart,
  ])

  const recentChanges = useMemo(() => {
    const logs = [...supportLogs]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 6)
    return logs
  }, [supportLogs])

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-800">Мониторинг и статистика</h2>
        <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
          Общий обзор активности платформы, динамика дневников и последние действия службы поддержки. Данные собираются
          из локального хранилища и предназначены для оперативного контроля.
        </p>
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
            <h3 className="text-lg font-semibold text-gray-800">Новые дневники за 7 дней</h3>
            <span className="text-xs text-gray-400">Всего: {stats.created7Days}</span>
          </div>
          <div className="flex items-end gap-3 h-48">
            {diariesCreatedChart.map(day => {
              const max = Math.max(...diariesCreatedChart.map(item => item.value), 1)
              const height =
                max === 0 || day.value === 0 ? 0 : Math.min(100, Math.max(18, (day.value / max) * 75 + 15))
              return (
                <div key={day.label} className="flex-1 flex flex-col items-center justify-end gap-2">
                  <div
                    className="w-full rounded-2xl bg-[#55ACBF]/20 flex items-end justify-center overflow-hidden"
                    style={{ height: '100%' }}
                  >
                    <div
                      className="w-full bg-[#55ACBF] transition-all rounded-t-2xl"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 text-center leading-tight">
                    {day.label}
                    <br />
                    {day.value}
                  </div>
                </div>
              )
            })}
            {stats.created7Days === 0 && (
              <div className="text-sm text-gray-500">Нет данных за выбранный период.</div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">Активные дневники за 7 дней</h3>
            <span className="text-xs text-gray-400">Всего: {stats.activeDiaries7Days}</span>
          </div>
          <div className="flex items-end gap-3 h-48">
            {entriesActivityChart.map(day => {
              const max = Math.max(...entriesActivityChart.map(item => item.value), 1)
              const height =
                max === 0 || day.value === 0 ? 0 : Math.min(100, Math.max(18, (day.value / max) * 75 + 15))
              return (
                <div key={day.label} className="flex-1 flex flex-col items-center justify-end gap-2">
                  <div
                    className="w-full rounded-2xl bg-[#0A6D83]/15 flex items-end justify-center overflow-hidden"
                    style={{ height: '100%' }}
                  >
                    <div
                      className="w-full bg-[#0A6D83] transition-all rounded-t-2xl"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 text-center leading-tight">
                    {day.label}
                    <br />
                    {day.value}
                  </div>
                </div>
              )
            })}
            {stats.activeDiaries7Days === 0 && (
              <div className="text-sm text-gray-500">Нет данных за выбранный период.</div>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Учитываются дневники, где за день была внесена минимум одна запись (любой показатель).
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-3">
          <h3 className="text-lg font-semibold text-gray-800">Топ показателей</h3>
          <p className="text-xs text-gray-500">
            Наиболее часто заполняемые показатели за последние 7 дней по данным истории.
          </p>
          <div className="space-y-2">
            {(() => {
              const counter = new Map<string, number>()
              Object.values(historyStorage).forEach(value => {
                if (!Array.isArray(value)) return
                value.forEach((entry: any) => {
                  if (!entry?.metric_type || !entry?.created_at) return
                  const date = new Date(entry.created_at)
                  const diff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
                  if (diff <= 6) {
                    counter.set(entry.metric_type, (counter.get(entry.metric_type) || 0) + 1)
                  }
                })
              })
              const sorted = Array.from(counter.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
              if (sorted.length === 0) {
                return <p className="text-sm text-gray-500">Пока нет данных.</p>
              }
              return sorted.map(([type, value]) => (
                <div key={type} className="flex items-center justify-between bg-[#F7FCFD] px-4 py-2 rounded-2xl">
                  <span className="text-sm text-gray-700">{getMetricLabel(type)}</span>
                  <span className="text-sm font-semibold text-[#0A6D83]">{value}</span>
                </div>
              ))
            })()}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-3">
          <h3 className="text-lg font-semibold text-gray-800">Последние действия поддержки</h3>
          {recentChanges.length === 0 ? (
            <p className="text-sm text-gray-500">Журнал пуст.</p>
          ) : (
            <div className="space-y-2">
              {recentChanges.map(entry => (
                <div key={entry.id} className="border border-gray-100 rounded-2xl px-4 py-3 text-sm">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>{new Date(entry.timestamp).toLocaleString('ru-RU')}</span>
                    <span className="font-medium text-gray-600">{entry.action}</span>
                  </div>
                  <p className="text-gray-700">{entry.details}</p>
                  <p className="text-xs text-gray-500 mt-1 break-all">Дневник: {entry.diaryId}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


