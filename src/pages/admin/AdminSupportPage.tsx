import { useEffect, useMemo, useState } from 'react'
import { Button, Input } from '@/components/ui'

type SupportTab = 'overview' | 'history' | 'edit' | 'export' | 'logs'

interface SupportPerson {
  id: string
  name: string
  contact?: string
  role?: string
  source?: string
  raw?: any
}

interface SupportOrganization {
  id: string
  name: string
  contact?: string
  typeLabel?: string | null
  raw?: any
}

interface SupportDiary {
  id: string
  createdAt?: string | null
  cardId?: string | null
  patientName: string
  card?: any
  owner?: SupportPerson | null
  caregiver?: SupportPerson | null
  organization?: SupportOrganization | null
  raw: any
}

interface SupportLogEntry {
  id: string
  diaryId: string
  timestamp: string
  action: string
  details: string
  payload?: Record<string, any>
}

interface DiaryMetricValue {
  id: string
  diary_id: string
  metric_type: string
  value: any
  created_at: string
}

interface CardDraft {
  full_name: string
  date_of_birth: string
  address: string
  entrance: string
  apartment: string
  gender: 'male' | 'female'
  mobility: string
  has_pets: boolean
  diagnoses: string[]
  services: string[]
  service_wishes: string[]
}

type DiaryFilter = 'all' | 'with_org' | 'without_org' | 'with_caregiver'
type DiarySort = 'desc' | 'asc'

const organizationTypeLabel = (value?: string | null) => {
  switch (value) {
    case 'pension':
      return 'Пансионат'
    case 'patronage_agency':
      return 'Патронажное агентство'
    case 'caregiver':
      return 'Частная сиделка'
    default:
      return value ? String(value) : null
  }
}

const buildPersonName = (input: { first_name?: string; last_name?: string; full_name?: string; name?: string }) => {
  const { full_name, name, first_name, last_name } = input || {}
  if (full_name && String(full_name).trim().length > 0) return String(full_name).trim()
  if (name && String(name).trim().length > 0) return String(name).trim()
  const combined = `${first_name || ''} ${last_name || ''}`.trim()
  if (combined.length > 0) return combined
  return ''
}

const safeString = (value: any) => (value === undefined || value === null ? '' : String(value))

const isEntityDeleted = (entity: any): boolean => {
  if (!entity || typeof entity !== 'object') return false
  const status = String(entity.status ?? entity.state ?? entity.lifecycle ?? '')
    .trim()
    .toLowerCase()
  if (['deleted', 'archived', 'removed', 'inactive'].includes(status)) return true
  if (entity.deleted === true || entity.is_deleted === true || entity.archived === true || entity.is_archived === true)
    return true
  if (entity.deleted_at || entity.removed_at || entity.archived_at) return true
  return false
}

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

const loadDiaryHistoryEntries = (diaryId: string): DiaryMetricValue[] => {
  try {
    const storage = readObject('diary_history')
    const rawEntries = storage[diaryId] || []
    return mergeDiaryEntries(rawEntries)
  } catch (error) {
    console.warn('Не удалось загрузить историю дневника', error)
    return []
  }
}

const persistDiaryHistoryEntries = (diaryId: string, entries: DiaryMetricValue[]) => {
  try {
    const storage = readObject('diary_history')
    const nextStorage = {
      ...(storage && typeof storage === 'object' ? storage : {}),
      [diaryId]: entries,
    }
    localStorage.setItem('diary_history', JSON.stringify(nextStorage))
  } catch (error) {
    console.warn('Не удалось сохранить историю дневника', error)
  }
}

const loadSupportLogs = (): SupportLogEntry[] => {
  try {
    const raw = localStorage.getItem('admin_support_audit')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch (error) {
    console.warn('Не удалось загрузить журнал поддержки', error)
  }
  return []
}

const persistSupportLog = (entry: SupportLogEntry) => {
  const logs = loadSupportLogs()
  logs.push(entry)
  try {
    localStorage.setItem('admin_support_audit', JSON.stringify(logs))
  } catch (error) {
    console.warn('Не удалось сохранить запись поддержки', error)
  }
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
    blood_sugar: 'Уровень сахара в крови',
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

const mobilityLabels: Record<string, string> = {
  walks: 'Ходит',
  sits: 'Сидит',
  lies: 'Лежит',
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('ru-RU')
  } catch {
    return value
  }
}

const formatDate = (value?: string | null) => {
  if (!value) return ''
  try {
    return new Date(value).toISOString().slice(0, 10)
  } catch {
    return value
  }
}

export const AdminSupportPage = () => {
  const [search, setSearch] = useState('')
  const [dataVersion, setDataVersion] = useState(0)
  const [selectedDiaryId, setSelectedDiaryId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SupportTab>('overview')
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null)
  const [cardMessage, setCardMessage] = useState<string | null>(null)
  const [historyEntries, setHistoryEntries] = useState<DiaryMetricValue[]>([])
  const [historyForm, setHistoryForm] = useState({ metricType: '', value: '', note: '' })
  const [historyMessage, setHistoryMessage] = useState<string | null>(null)
  const [filterRole, setFilterRole] = useState<DiaryFilter>('all')
  const [sortOrder, setSortOrder] = useState<DiarySort>('desc')

  const diariesData = useMemo<SupportDiary[]>(() => {
    const diariesRaw = readArray(['diaries']).filter(diary => !isEntityDeleted(diary))
    const patientCardsRaw = readArray(['patient_cards'])
    const localUsers = readArray(['local_users'])
    const localClients = readArray(['local_clients'])
    const localEmployees = readArray(['local_employees'])
    const organizations = readArray(['organizations', 'admin_organizations'])
    const caregiverProfiles = readArray(['private_caregiver_profiles'])

    const cardsMap = new Map<string, any>()
    patientCardsRaw.forEach(card => {
      if (isEntityDeleted(card)) return
      cardsMap.set(safeString(card?.id), card)
    })

    const resolvePerson = (id?: string | null): SupportPerson | null => {
      if (!id) return null
      const target = safeString(id)
      const user = localUsers.find(item => safeString(item?.id) === target)
      if (user && !isEntityDeleted(user)) {
        return {
          id: target,
          name: buildPersonName(user) || user.phone || user.email || `Пользователь ${target}`,
          contact: user.phone || user.email || '',
          role: user.user_role || 'Пользователь',
          source: 'local_users',
          raw: user,
        }
      }

      const client = localClients.find(item => safeString(item?.user_id || item?.id) === target)
      if (client && !isEntityDeleted(client)) {
        return {
          id: target,
          name: buildPersonName(client) || client.phone || `Клиент ${target}`,
          contact: client.phone || '',
          role: 'Клиент',
          source: 'local_clients',
          raw: client,
        }
      }

      const employee = localEmployees.find(item => safeString(item?.user_id || item?.id) === target)
      if (employee && !isEntityDeleted(employee)) {
        return {
          id: target,
          name: buildPersonName(employee) || employee.phone || `Сотрудник ${target}`,
          contact: employee.phone || employee.email || '',
          role: employee.role || 'Сотрудник',
          source: 'local_employees',
          raw: employee,
        }
      }

      const caregiver = caregiverProfiles.find(item => safeString(item?.user_id || item?.id) === target)
      if (caregiver && !isEntityDeleted(caregiver)) {
        return {
          id: target,
          name: buildPersonName(caregiver) || caregiver.phone || `Сиделка ${target}`,
          contact: caregiver.phone || caregiver.email || '',
          role: 'Частная сиделка',
          source: 'private_caregiver_profiles',
          raw: caregiver,
        }
      }

      const organization = organizations.find(item => {
        const orgId = item?.id ?? item?.user_id
        return safeString(orgId) === target
      })

      if (organization && !isEntityDeleted(organization)) {
        return {
          id: target,
          name: organization.name || buildPersonName(organization) || `Организация ${target}`,
          contact: organization.phone || organization.email || '',
          role: organizationTypeLabel(organization.type) || 'Организация',
          source: 'organizations',
          raw: organization,
        }
      }

      return {
        id: target,
        name: `ID: ${target}`,
        contact: '',
        role: '',
        source: 'unknown',
      }
    }

    const resolveOrganization = (id?: string | null): SupportOrganization | null => {
      if (!id) return null
      const target = safeString(id)
      const organization = organizations.find(item => {
        const orgId = item?.id ?? item?.user_id
        return safeString(orgId) === target
      })
      if (!organization || isEntityDeleted(organization)) return null
      return {
        id: target,
        name: organization.name || buildPersonName(organization) || `Организация ${target}`,
        contact: organization.phone || organization.email || '',
        typeLabel: organizationTypeLabel(organization.type),
        raw: organization,
      }
    }

    const activeDiaries: SupportDiary[] = []

    diariesRaw.forEach((diary: any) => {
      if (isEntityDeleted(diary)) return
      const id = safeString(diary?.id)
      if (!id) return

      const cardId = safeString(diary?.patient_card_id)
      const card = cardId ? cardsMap.get(cardId) : undefined
      if (cardId && !card) {
        // Карточка была удалена — пропускаем дневник
        return
      }

      if (card && isEntityDeleted(card)) {
        return
      }

      const owner = resolvePerson(diary?.owner_id ?? diary?.client_id)
      const caregiver = resolvePerson(diary?.caregiver_id)
      const organization = resolveOrganization(diary?.organization_id)

      const patientName =
        card?.full_name ||
        card?.name ||
        owner?.name ||
        diary?.patient_name ||
        `Подопечный (${cardId || 'без карточки'})`

      activeDiaries.push({
        id,
        createdAt: diary?.created_at || null,
        cardId: cardId || null,
        patientName,
        card,
        owner,
        caregiver,
        organization,
        raw: diary,
      })
    })

    return activeDiaries
  }, [dataVersion])

  const supportStats = useMemo(() => {
    const total = diariesData.length
    const withOrg = diariesData.filter(item => item.organization).length
    const withCaregiver = diariesData.filter(item => item.caregiver).length
    const withoutOrg = total - withOrg
    return {
      total,
      withOrg,
      withoutOrg,
      withCaregiver,
    }
  }, [diariesData])

  const filteredDiaries = useMemo(() => {
    const byRole = diariesData.filter(item => {
      switch (filterRole) {
        case 'with_org':
          return Boolean(item.organization)
        case 'without_org':
          return !item.organization
        case 'with_caregiver':
          return Boolean(item.caregiver)
        default:
          return true
      }
    })

    const query = search.trim().toLowerCase()
    const searched = !query
      ? byRole
      : byRole.filter(item => {
          const haystack = [
            item.id,
            item.patientName,
            item.cardId,
            item.owner?.name,
            item.owner?.contact,
            item.organization?.name,
            item.organization?.typeLabel,
            item.caregiver?.name,
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(query)
        })

    return searched
      .slice()
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB
      })
  }, [diariesData, search, filterRole, sortOrder])

  useEffect(() => {
    if (filteredDiaries.length === 0) {
      setSelectedDiaryId(null)
      return
    }
    if (!selectedDiaryId || !filteredDiaries.some(item => item.id === selectedDiaryId)) {
      setSelectedDiaryId(filteredDiaries[0].id)
      setActiveTab('overview')
    }
  }, [filteredDiaries, selectedDiaryId])

  const selectedDiary = useMemo(
    () => filteredDiaries.find(item => item.id === selectedDiaryId) || null,
    [filteredDiaries, selectedDiaryId]
  )

  useEffect(() => {
    if (!selectedDiary) {
      setCardDraft(null)
      setHistoryEntries([])
      return
    }

    const card = selectedDiary.card
    setCardDraft({
      full_name: card?.full_name || '',
      date_of_birth: formatDate(card?.date_of_birth),
      address: card?.address || '',
      entrance: card?.entrance || '',
      apartment: card?.apartment || '',
      gender: card?.gender === 'female' ? 'female' : 'male',
      mobility: card?.mobility || 'walks',
      has_pets: Boolean(card?.has_pets),
      diagnoses: Array.isArray(card?.diagnoses) ? card.diagnoses : [],
      services: Array.isArray(card?.services) ? card.services : [],
      service_wishes: Array.isArray(card?.service_wishes) ? card.service_wishes : [],
    })
    setHistoryEntries(loadDiaryHistoryEntries(selectedDiary.id))
    setHistoryForm({ metricType: '', value: '', note: '' })
    setCardMessage(null)
    setHistoryMessage(null)
  }, [selectedDiary?.id, dataVersion])

  const logs = useMemo(() => loadSupportLogs(), [dataVersion])
  const selectedLogs = useMemo(
    () =>
      logs
        .filter(log => selectedDiary && log.diaryId === selectedDiary.id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [logs, selectedDiary]
  )

  const handleSelectDiary = (id: string) => {
    setSelectedDiaryId(id)
    setActiveTab('overview')
  }

  const handleCardFieldChange = (field: keyof CardDraft, value: string | boolean | string[]) => {
    setCardDraft(prev => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleToggleArrayField = (field: 'diagnoses' | 'services' | 'service_wishes', value: string) => {
    setCardDraft(prev => {
      if (!prev) return prev
      const current = prev[field]
      const exists = current.includes(value)
      return {
        ...prev,
        [field]: exists ? current.filter(item => item !== value) : [...current, value],
      }
    })
  }

  const handleSaveCard = () => {
    if (!selectedDiary || !cardDraft || !selectedDiary.cardId) return
    const cards = readArray(['patient_cards'])
    const targetId = selectedDiary.cardId
    const index = cards.findIndex(card => safeString(card?.id) === targetId)
    if (index === -1) {
      setCardMessage('Карточка не найдена в хранилище')
      return
    }

    const normalizeList = (value: string | string[]) => {
      if (Array.isArray(value)) {
        return value
      }
      if (!value) return []
      return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    }

    const updatedCard = {
      ...cards[index],
      full_name: cardDraft.full_name,
      date_of_birth: cardDraft.date_of_birth || null,
      address: cardDraft.address,
      entrance: cardDraft.entrance,
      apartment: cardDraft.apartment,
      gender: cardDraft.gender,
      mobility: cardDraft.mobility,
      has_pets: cardDraft.has_pets,
      diagnoses: normalizeList(cardDraft.diagnoses),
      services: normalizeList(cardDraft.services),
      service_wishes: normalizeList(cardDraft.service_wishes),
    }

    cards[index] = updatedCard

    try {
      localStorage.setItem('patient_cards', JSON.stringify(cards))
      persistSupportLog({
        id: `support_${Date.now()}`,
        diaryId: selectedDiary.id,
        timestamp: new Date().toISOString(),
        action: 'update_patient_card',
        details: `Обновлены данные карточки подопечного (${targetId})`,
        payload: {
          full_name: updatedCard.full_name,
          date_of_birth: updatedCard.date_of_birth,
          address: updatedCard.address,
        },
      })
      setCardMessage('Данные сохранены')
      setDataVersion(prev => prev + 1)
    } catch (error) {
      console.error('Не удалось обновить карточку', error)
      setCardMessage('Ошибка при сохранении')
    }
  }

  const handleAddHistoryEntry = () => {
    if (!selectedDiary) return
    const value = historyForm.value.trim()
    if (!value) {
      setHistoryMessage('Введите значение записи')
      return
    }

    const metricType = historyForm.metricType.trim() || 'support_note'
    const note = historyForm.note.trim()
    const entryValue = note ? `${value} · ${note}` : value

    const entry = {
      id: `support_${Date.now()}`,
      diary_id: selectedDiary.id,
      metric_type: metricType,
      value: entryValue,
      created_at: new Date().toISOString(),
      author: 'support',
    }

    const nextEntries = mergeDiaryEntries([...historyEntries, entry])
    persistDiaryHistoryEntries(selectedDiary.id, nextEntries)
    persistSupportLog({
      id: `support_${Date.now()}_${metricType}`,
      diaryId: selectedDiary.id,
      timestamp: new Date().toISOString(),
      action: 'add_history_entry',
      details: `Добавлена запись по показателю ${getMetricLabel(metricType)}`,
      payload: {
        metric_type: metricType,
        value: entryValue,
      },
    })

    setHistoryEntries(nextEntries)
    setHistoryForm({ metricType: '', value: '', note: '' })
    setHistoryMessage('Запись добавлена')
    setDataVersion(prev => prev + 1)
  }

  const handleRemoveHistoryEntry = (entryId: string) => {
    if (!selectedDiary) return
    const confirmed = window.confirm('Удалить выбранную запись истории?')
    if (!confirmed) return

    const nextEntries = historyEntries.filter(entry => entry.id !== entryId)
    persistDiaryHistoryEntries(selectedDiary.id, nextEntries)
    persistSupportLog({
      id: `support_${Date.now()}_remove_history`,
      diaryId: selectedDiary.id,
      timestamp: new Date().toISOString(),
      action: 'remove_history_entry',
      details: 'Запись истории удалена службой поддержки',
      payload: {
        entry_id: entryId,
      },
    })
    setHistoryEntries(nextEntries)
    setHistoryMessage('Запись удалена')
    setDataVersion(prev => prev + 1)
  }

  const handleExport = () => {
    if (!selectedDiary) return
    const exportPayload = {
      diary: selectedDiary.raw,
      patient_card: selectedDiary.card,
      owner: selectedDiary.owner,
      caregiver: selectedDiary.caregiver,
      organization: selectedDiary.organization,
      history: historyEntries,
      support_logs: selectedLogs,
    }
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `diary_${selectedDiary.id}_support.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold text-gray-800">Помощь пользователям</h2>
        <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
          Инструменты для службы поддержки: просмотр дневников, внесение изменений от имени пользователей и журнал
          выполненных действий. Используйте панель слева, чтобы выбрать нужный дневник.
        </p>
        <div className="inline-flex text-xs text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-full">
          Шаг 12.4 — операции выполняются в локальном хранилище данных
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Всего дневников', value: supportStats.total },
          { label: 'С организациями', value: supportStats.withOrg },
          { label: 'С сиделками', value: supportStats.withCaregiver },
          { label: 'Без организации', value: supportStats.withoutOrg },
        ].map(card => (
          <div
            key={card.label}
            className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col gap-1"
          >
            <span className="text-xs uppercase text-gray-400">{card.label}</span>
            <span className="text-2xl font-semibold text-[#0A6D83]">{card.value}</span>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-1/3 space-y-4">
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Поиск по ФИО, организации или ID дневника"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: 'all', label: 'Все' },
                    { value: 'with_org', label: 'С организацией' },
                    { value: 'without_org', label: 'Без организации' },
                    { value: 'with_caregiver', label: 'С сиделкой' },
                  ] as Array<{ value: DiaryFilter; label: string }>
                ).map(option => (
                  <button
                    key={option.value}
                    onClick={() => setFilterRole(option.value)}
                    className={`px-3 py-1 rounded-full border transition-colors ${
                      filterRole === option.value
                        ? 'border-[#55ACBF] bg-[#55ACBF]/10 text-[#0A6D83] font-medium'
                        : 'border-gray-200 text-gray-500 hover:border-[#55ACBF]/40'
                    }`}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                className="px-3 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-[#55ACBF]/40 transition-colors"
              >
                Сортировка: {sortOrder === 'desc' ? 'сначала новые' : 'сначала старые'}
              </button>
            </div>
            <div className="border border-gray-100 rounded-2xl divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
              {filteredDiaries.length === 0 && (
                <div className="px-4 py-6 text-sm text-gray-500 text-center">
                  Дневники не найдены. Измените запрос поиска.
                </div>
              )}
              {filteredDiaries.map(item => {
                const isActive = item.id === selectedDiaryId
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectDiary(item.id)}
                    className={`w-full text-left px-4 py-4 transition-colors rounded-2xl border ${
                      isActive
                        ? 'border-[#55ACBF] bg-[#F7FCFD] shadow-sm'
                        : 'border-transparent hover:border-[#55ACBF]/30 hover:bg-gray-50'
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-gray-800">{item.patientName}</p>
                      <p className="text-xs text-gray-500 break-all">ID дневника: {item.id}</p>
                      {item.cardId && (
                        <p className="text-xs text-gray-500 break-all">Карточка: {item.cardId}</p>
                      )}
                      <div className="flex flex-wrap gap-1 text-[11px] text-gray-500">
                        {item.owner && <span>Владелец: {item.owner.name}</span>}
                        {item.organization && <span>Орг.: {item.organization.name}</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="lg:flex-1 bg-gray-50 rounded-3xl p-6 space-y-6 border border-gray-100">
            {!selectedDiary ? (
              <div className="text-center text-sm text-gray-500 py-12">
                Выберите дневник слева, чтобы просмотреть подробности.
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase text-gray-500">Подопечный</p>
                    <h3 className="text-xl font-semibold text-gray-800">{selectedDiary.patientName}</h3>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
                      <span>Дневник создан: {formatDateTime(selectedDiary.createdAt)}</span>
                      {selectedDiary.organization?.typeLabel && (
                        <span>Организация: {selectedDiary.organization.typeLabel}</span>
                      )}
                    </div>
                  </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {selectedDiary.owner && (
                    <div className="px-3 py-1 bg-white border border-gray-200 rounded-full text-gray-600">
                      Владелец: {selectedDiary.owner.name}
                    </div>
                  )}
                  {selectedDiary.caregiver && (
                    <div className="px-3 py-1 bg-white border border-gray-200 rounded-full text-gray-600">
                      Сиделка: {selectedDiary.caregiver.name}
                    </div>
                  )}
                </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(['overview', 'history', 'edit', 'export', 'logs'] as SupportTab[]).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        activeTab === tab
                          ? 'bg-[#55ACBF]/10 text-[#0A6D83] border border-[#55ACBF]/40'
                          : 'text-gray-500 border border-transparent hover:bg-white'
                      }`}
                    >
                      {tab === 'overview'
                        ? 'Обзор'
                        : tab === 'history'
                        ? 'История'
                        : tab === 'edit'
                        ? 'Редактировать'
                        : tab === 'export'
                        ? 'Экспорт'
                        : 'Журнал'}
                    </button>
                  ))}
                </div>

                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
                      <h4 className="text-sm font-semibold text-gray-700">Быстрый обзор</h4>
                      <div className="grid sm:grid-cols-2 gap-3 text-sm text-gray-600">
                        <div>
                          <p className="text-xs uppercase text-gray-400">Владелец</p>
                          <p>{selectedDiary.owner?.name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-gray-400">Контакт владельца</p>
                          <p className="text-xs text-gray-500">
                            {selectedDiary.owner?.raw?.email ||
                              selectedDiary.owner?.contact ||
                              '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-gray-400">Организация</p>
                          <p>{selectedDiary.organization?.name || '—'}</p>
                          {selectedDiary.organization?.contact && (
                            <p className="text-xs text-gray-400">{selectedDiary.organization.contact}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs uppercase text-gray-400">Сиделка</p>
                          <p>{selectedDiary.caregiver?.name || '—'}</p>
                          {selectedDiary.caregiver?.contact && (
                            <p className="text-xs text-gray-400">{selectedDiary.caregiver.contact}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs uppercase text-gray-400">ID карточки</p>
                          <p>{selectedDiary.cardId || '—'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-2 text-sm text-gray-600">
                      <h4 className="text-sm font-semibold text-gray-700">Информация о карточке</h4>
                      <p>
                        Пол:{' '}
                        {selectedDiary.card?.gender === 'female'
                          ? 'Женский'
                          : selectedDiary.card?.gender === 'male'
                          ? 'Мужской'
                          : 'Не указан'}
                      </p>
                      <p>
                        Мобильность:{' '}
                        {selectedDiary.card?.mobility
                          ? mobilityLabels[selectedDiary.card?.mobility] || selectedDiary.card?.mobility
                          : '—'}
                      </p>
                      <p>Животные: {selectedDiary.card?.has_pets ? 'Да' : 'Нет'}</p>
                      <p>
                        Диагнозы:{' '}
                        {selectedDiary.card?.diagnoses && selectedDiary.card?.diagnoses.length > 0
                          ? selectedDiary.card.diagnoses.join(', ')
                          : '—'}
                      </p>
                      <p>
                        Услуги:{' '}
                        {selectedDiary.card?.services && selectedDiary.card?.services.length > 0
                          ? selectedDiary.card.services.join(', ')
                          : '—'}
                      </p>
                      <p>
                        Пожелания:{' '}
                        {selectedDiary.card?.service_wishes && selectedDiary.card?.service_wishes.length > 0
                          ? selectedDiary.card.service_wishes.join(', ')
                          : '—'}
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
                      <h4 className="text-sm font-semibold text-gray-700">Добавить запись</h4>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <Input
                          value={historyForm.metricType}
                          onChange={event => setHistoryForm(prev => ({ ...prev, metricType: event.target.value }))}
                          placeholder="Тип показателя (например, medications)"
                        />
                        <Input
                          value={historyForm.note}
                          onChange={event => setHistoryForm(prev => ({ ...prev, note: event.target.value }))}
                          placeholder="Комментарий (опционально)"
                        />
                      </div>
                      <textarea
                        value={historyForm.value}
                        onChange={event => setHistoryForm(prev => ({ ...prev, value: event.target.value }))}
                        placeholder="Значение записи"
                        className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#55ACBF]"
                        rows={3}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-gray-500">
                          Значение обязательное; тип по умолчанию — «support_note».
                        </div>
                        <Button onClick={handleAddHistoryEntry} size="sm">
                          Добавить запись
                        </Button>
                      </div>
                      {historyMessage && <p className="text-xs text-[#0A6D83]">{historyMessage}</p>}
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
                      <h4 className="text-sm font-semibold text-gray-700">История записей</h4>
                      <div className="space-y-4">
                        {historyEntries.length === 0 && <div className="text-sm text-gray-500">Записи отсутствуют.</div>}
                        {historyEntries
                          .slice()
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map(entry => (
                            <div key={entry.id} className="border border-gray-100 rounded-2xl">
                              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-gray-700">{getMetricLabel(entry.metric_type)}</span>
                                <div className="flex items-center gap-3 text-xs text-gray-400">
                                  <span>
                                    {new Date(entry.created_at).toLocaleString('ru-RU', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveHistoryEntry(entry.id)}
                                    className="px-2 py-1 rounded-full border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-300 transition-colors"
                                  >
                                    Удалить
                                  </button>
                                </div>
                              </div>
                              <div className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap break-words">
                                {String(entry.value || '')}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'edit' && (
                  <div className="space-y-4">
                    {cardDraft ? (
                      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="grid md:grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs uppercase text-gray-500 mb-1">ФИО подопечного</p>
                            <Input
                              value={cardDraft.full_name}
                              onChange={event => handleCardFieldChange('full_name', event.target.value)}
                              placeholder="Введите ФИО"
                            />
                          </div>
                          <div>
                            <p className="text-xs uppercase text-gray-500 mb-1">Дата рождения</p>
                            <Input
                              type="date"
                              value={cardDraft.date_of_birth}
                              onChange={event => handleCardFieldChange('date_of_birth', event.target.value)}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-xs uppercase text-gray-500 mb-1">Адрес</p>
                            <Input
                              value={cardDraft.address}
                              onChange={event => handleCardFieldChange('address', event.target.value)}
                              placeholder="Адрес проживания"
                            />
                          </div>
                          <div>
                            <p className="text-xs uppercase text-gray-500 mb-1">Подъезд</p>
                            <Input
                              value={cardDraft.entrance}
                              onChange={event => handleCardFieldChange('entrance', event.target.value)}
                              placeholder="№ подъезда"
                            />
                          </div>
                          <div>
                            <p className="text-xs uppercase text-gray-500 mb-1">Квартира</p>
                            <Input
                              value={cardDraft.apartment}
                              onChange={event => handleCardFieldChange('apartment', event.target.value)}
                              placeholder="№ квартиры"
                            />
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs uppercase text-gray-500 mb-2">Мобильность</p>
                            <div className="flex gap-2">
                              {[
                                { value: 'walks', label: 'Ходит' },
                                { value: 'sits', label: 'Сидит' },
                                { value: 'lies', label: 'Лежит' },
                              ].map(option => (
                                <button
                                  key={option.value}
                                  onClick={() => handleCardFieldChange('mobility', option.value)}
                                  className={`flex-1 px-3 py-2 rounded-xl border text-sm transition-colors ${
                                    cardDraft.mobility === option.value
                                      ? 'border-[#55ACBF] text-[#0A6D83] bg-[#55ACBF]/10'
                                      : 'border-gray-200 text-gray-600 hover:border-[#55ACBF]/40'
                                  }`}
                                  type="button"
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-gray-500 mb-2">Домашние животные</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleCardFieldChange('has_pets', false)}
                                className={`flex-1 px-3 py-2 rounded-xl border text-sm transition-colors ${
                                  cardDraft.has_pets
                                    ? 'border-gray-200 text-gray-600 hover:border-[#55ACBF]/40'
                                    : 'border-[#55ACBF] text-[#0A6D83] bg-[#55ACBF]/10'
                                }`}
                              >
                                Нет
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCardFieldChange('has_pets', true)}
                                className={`flex-1 px-3 py-2 rounded-xl border text-sm transition-colors ${
                                  cardDraft.has_pets
                                    ? 'border-[#55ACBF] text-[#0A6D83] bg-[#55ACBF]/10'
                                    : 'border-gray-200 text-gray-600 hover:border-[#55ACBF]/40'
                                }`}
                              >
                                Да
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-gray-500 mb-2">Пол</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleCardFieldChange('gender', 'male')}
                                className={`flex-1 px-3 py-2 rounded-xl border text-sm transition-colors ${
                                  cardDraft.gender === 'male'
                                    ? 'border-[#55ACBF] text-[#0A6D83] bg-[#55ACBF]/10'
                                    : 'border-gray-200 text-gray-600 hover:border-[#55ACBF]/40'
                                }`}
                              >
                                Мужской
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCardFieldChange('gender', 'female')}
                                className={`flex-1 px-3 py-2 rounded-xl border text-sm transition-colors ${
                                  cardDraft.gender === 'female'
                                    ? 'border-[#55ACBF] text-[#0A6D83] bg-[#55ACBF]/10'
                                    : 'border-gray-200 text-gray-600 hover:border-[#55ACBF]/40'
                                }`}
                              >
                                Женский
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <p className="text-xs uppercase text-gray-500 mb-2">Диагнозы</p>
                            <textarea
                              value={cardDraft.diagnoses.join('\n')}
                              onChange={event =>
                                handleCardFieldChange(
                                  'diagnoses',
                                  event.target.value
                                    .split('\n')
                                    .map(item => item.trim())
                                    .filter(Boolean)
                                )
                              }
                              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#55ACBF]"
                              placeholder="Каждый диагноз с новой строки"
                              rows={4}
                            />
                          </div>
                          <div>
                            <p className="text-xs uppercase text-gray-500 mb-2">Требуемые услуги</p>
                            <textarea
                              value={cardDraft.services.join('\n')}
                              onChange={event =>
                                handleCardFieldChange(
                                  'services',
                                  event.target.value
                                    .split('\n')
                                    .map(item => item.trim())
                                    .filter(Boolean)
                                )
                              }
                              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#55ACBF]"
                              placeholder="Каждая услуга с новой строки"
                              rows={4}
                            />
                          </div>
                          <div>
                            <p className="text-xs uppercase text-gray-500 mb-2">Пожелания по услугам</p>
                            <textarea
                              value={cardDraft.service_wishes.join('\n')}
                              onChange={event =>
                                handleCardFieldChange(
                                  'service_wishes',
                                  event.target.value
                                    .split('\n')
                                    .map(item => item.trim())
                                    .filter(Boolean)
                                )
                              }
                              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#55ACBF]"
                              placeholder="Каждое пожелание с новой строки"
                              rows={4}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-gray-500">
                            Изменения сразу попадают в карточку подопечного.
                          </div>
                          <Button onClick={handleSaveCard} size="sm">
                            Сохранить изменения
                          </Button>
                        </div>
                        {cardMessage && <p className="text-xs text-[#0A6D83]">{cardMessage}</p>}
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl p-5 shadow-sm text-sm text-gray-500">
                        Карточка подопечного не найдена или не привязана к дневнику.
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'export' && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4 text-sm text-gray-600">
                    <p>
                      Вы можете выгрузить дневник вместе с карточкой, историей записей и журналом действий поддержки в
                      формате JSON. Файл полезен для передачи в техническую команду или для резервного копирования.
                    </p>
                    <Button onClick={handleExport}>Выгрузить JSON</Button>
                  </div>
                )}

                {activeTab === 'logs' && (
                  <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3 text-sm text-gray-600">
                    <h4 className="text-sm font-semibold text-gray-700">Журнал действий поддержки</h4>
                    {selectedLogs.length === 0 ? (
                      <p className="text-sm text-gray-500">Записей ещё нет.</p>
                    ) : (
                      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                        {selectedLogs.map(entry => (
                          <div key={entry.id} className="border border-gray-100 rounded-2xl px-4 py-3 bg-white">
                            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                              <span>{formatDateTime(entry.timestamp)}</span>
                              <span>{entry.action}</span>
                            </div>
                            <p className="text-gray-700">{entry.details}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


