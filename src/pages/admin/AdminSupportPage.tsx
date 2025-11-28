import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { getFunctionUrl } from '@/utils/supabaseConfig'

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

const _readArray = (keys: string[]): any[] => {
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
void _readArray // Prevent unused variable warning

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

const _loadDiaryHistoryEntries = (diaryId: string): DiaryMetricValue[] => {
  try {
    const storage = readObject('diary_history')
    const rawEntries = storage[diaryId] || []
    return mergeDiaryEntries(rawEntries)
  } catch (error) {
    console.warn('Не удалось загрузить историю дневника', error)
    return []
  }
}
void _loadDiaryHistoryEntries // Prevent unused variable warning

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
  const [_activeTab, setActiveTab] = useState<SupportTab>('overview')
  void _activeTab // Prevent unused variable warning
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null)
  const [_cardMessage, setCardMessage] = useState<string | null>(null)
  void _cardMessage // Prevent unused variable warning
  const [historyEntries, setHistoryEntries] = useState<DiaryMetricValue[]>([])
  const [historyForm, setHistoryForm] = useState({ metricType: '', value: '', note: '' })
  const [_historyMessage, setHistoryMessage] = useState<string | null>(null)
  void _historyMessage // Prevent unused variable warning
  const [filterRole, setFilterRole] = useState<DiaryFilter>('all')
  const [sortOrder, setSortOrder] = useState<DiarySort>('desc')
  const [isLoading, setIsLoading] = useState(true)
  const [supabaseData, setSupabaseData] = useState<{
    diaries: any[]
    patientCards: any[]
    organizations: any[]
    userProfiles: any[]
    clients: any[]
    employees: any[]
    privateCaregivers: any[]
    metricValues: any[]
    history: any[]
  }>({
    diaries: [],
    patientCards: [],
    organizations: [],
    userProfiles: [],
    clients: [],
    employees: [],
    privateCaregivers: [],
    metricValues: [],
    history: [],
  })

  // Загрузка данных из Supabase
  useEffect(() => {
    const loadSupabaseData = async () => {
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
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'apikey': supabaseAnonKey,
          },
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Неизвестная ошибка' }))
          console.error('Ошибка загрузки данных:', errorData)
          setIsLoading(false)
          return
        }

        const result = await response.json()

        if (!result.success || !result.data) {
          console.error('Неверный формат ответа от Edge Function')
          setIsLoading(false)
          return
        }

        console.log('✅ Загружены данные из Supabase для поддержки:', {
          diaries: result.data.diaries?.length || 0,
          patientCards: result.data.patientCards?.length || 0,
          organizations: result.data.organizations?.length || 0,
          metricValues: result.data.metricValues?.length || 0,
          history: result.data.history?.length || 0,
        })

        setSupabaseData({
          diaries: result.data.diaries || [],
          patientCards: result.data.patientCards || [],
          organizations: result.data.organizations || [],
          userProfiles: result.data.userProfiles || [],
          clients: result.data.clients || [],
          employees: result.data.employees || [],
          privateCaregivers: result.data.privateCaregivers || [],
          metricValues: result.data.metricValues || [],
          history: result.data.history || [],
        })
      } catch (error) {
        console.error('Ошибка загрузки данных из Supabase:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSupabaseData()
  }, [dataVersion])

  const diariesData = useMemo<SupportDiary[]>(() => {
    const diariesRaw = supabaseData.diaries.filter(diary => !isEntityDeleted(diary))
    const patientCardsRaw = supabaseData.patientCards
    const localUsers = supabaseData.userProfiles
    const localClients = supabaseData.clients
    const localEmployees = supabaseData.employees
    const organizations = supabaseData.organizations
    const caregiverProfiles = supabaseData.privateCaregivers

    const cardsMap = new Map<string, any>()
    patientCardsRaw.forEach(card => {
      if (isEntityDeleted(card)) return
      cardsMap.set(safeString(card?.id), card)
    })

    const resolvePerson = (id?: string | null): SupportPerson | null => {
      if (!id) return null
      const target = safeString(id)
      
      // Ищем в user_profiles (для всех пользователей)
      const user = localUsers.find(item => safeString(item?.user_id || item?.id) === target)
      if (user && !isEntityDeleted(user)) {
        return {
          id: target,
          name: buildPersonName(user) || user.phone || user.email || `Пользователь ${target}`,
          contact: user.phone || user.email || '',
          role: user.user_role || 'Пользователь',
          source: 'user_profiles',
          raw: user,
        }
      }

      // Ищем в clients
      const client = localClients.find(item => safeString(item?.user_id || item?.id) === target)
      if (client && !isEntityDeleted(client)) {
        return {
          id: target,
          name: buildPersonName(client) || client.phone || `Клиент ${target}`,
          contact: client.phone || '',
          role: 'Клиент',
          source: 'clients',
          raw: client,
        }
      }

      // Ищем в organization_employees
      const employee = localEmployees.find(item => safeString(item?.user_id || item?.id) === target)
      if (employee && !isEntityDeleted(employee)) {
        return {
          id: target,
          name: buildPersonName(employee) || employee.phone || `Сотрудник ${target}`,
          contact: employee.phone || employee.email || '',
          role: employee.role || 'Сотрудник',
          source: 'organization_employees',
          raw: employee,
        }
      }

      // Ищем в private_caregiver_profiles
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
  }, [dataVersion, supabaseData])

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
    
    // Загружаем историю из Supabase
    const diaryHistory = supabaseData.history
      .filter((entry: any) => entry.diary_id === selectedDiary.id)
      .map((entry: any) => ({
        id: entry.id,
        diary_id: entry.diary_id,
        metric_type: entry.metric_type || 'support_note',
        value: entry.value || entry.details || '',
        created_at: entry.occurred_at || entry.created_at || new Date().toISOString(),
      }))
    
    // Также добавляем метрики из diary_metric_values
    const diaryMetrics = supabaseData.metricValues
      .filter((metric: any) => metric.diary_id === selectedDiary.id)
      .map((metric: any) => ({
        id: metric.id,
        diary_id: metric.diary_id,
        metric_type: metric.metric_type,
        value: typeof metric.value === 'object' ? JSON.stringify(metric.value) : String(metric.value || ''),
        created_at: metric.recorded_at || metric.created_at || new Date().toISOString(),
      }))
    
    setHistoryEntries([...diaryHistory, ...diaryMetrics])
    setHistoryForm({ metricType: '', value: '', note: '' })
    setCardMessage(null)
    setHistoryMessage(null)
  }, [selectedDiary?.id, dataVersion, supabaseData.history, supabaseData.metricValues])

  const logs = useMemo(() => loadSupportLogs(), [dataVersion])
  const selectedLogs = useMemo(
    () =>
      logs
        .filter(log => selectedDiary && log.diaryId === selectedDiary.id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [logs, selectedDiary]
  )

  const handleSelectDiary = (id: string, openModal = false) => {
    setSelectedDiaryId(id)
    setActiveTab('overview')
    if (openModal) {
      setIsModalOpen(true)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const _handleCardFieldChange = (field: keyof CardDraft, value: string | boolean | string[]) => {
    setCardDraft(prev => (prev ? { ...prev, [field]: value } : prev))
  }
  void _handleCardFieldChange // Prevent unused variable warning

  // const handleToggleArrayField = (field: 'diagnoses' | 'services' | 'service_wishes', value: string) => {
  //   setCardDraft(prev => {
  //     if (!prev) return prev
  //     const current = prev[field]
  //     const exists = current.includes(value)
  //     return {
  //       ...prev,
  //       [field]: exists ? current.filter(item => item !== value) : [...current, value],
  //     }
  //   })
  // }

  const _handleSaveCard = async () => {
    if (!selectedDiary || !cardDraft || !selectedDiary.cardId) return
    
    try {
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

      const { error } = await supabase
        .from('patient_cards')
        .update({
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
        })
        .eq('id', selectedDiary.cardId)

      if (error) {
        console.error('Ошибка обновления карточки:', error)
        setCardMessage('Ошибка при сохранении')
        return
      }

      persistSupportLog({
        id: `support_${Date.now()}`,
        diaryId: selectedDiary.id,
        timestamp: new Date().toISOString(),
        action: 'update_patient_card',
        details: `Обновлены данные карточки подопечного (${selectedDiary.cardId})`,
        payload: {
          full_name: cardDraft.full_name,
          date_of_birth: cardDraft.date_of_birth,
          address: cardDraft.address,
        },
      })
      setCardMessage('Данные сохранены')
      setDataVersion(prev => prev + 1)
    } catch (error) {
      console.error('Не удалось обновить карточку', error)
      setCardMessage('Ошибка при сохранении')
    }
  }
  void _handleSaveCard // Prevent unused variable warning

  const _handleAddHistoryEntry = () => {
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
  void _handleAddHistoryEntry // Prevent unused variable warning

  const _handleRemoveHistoryEntry = (entryId: string) => {
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
  void _handleRemoveHistoryEntry // Prevent unused variable warning

  const _handleExport = () => {
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
  void _handleExport // Prevent unused variable warning

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-800">Помощь пользователям</h2>
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

      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm text-center text-gray-500">
          Загрузка данных...
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Левая колонка: список дневников */}
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
                      onClick={() => handleSelectDiary(item.id, true)}
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

            {/* Правая колонка: детали дневника */}
            <div className="lg:flex-1 bg-gray-50 rounded-3xl p-6 space-y-6 border border-gray-100">
              {!selectedDiary ? (
                <div className="text-center text-sm text-gray-500 py-12">
                  Выберите дневник слева, чтобы просмотреть подробности.
                </div>
              ) : (
                <>
                  {/* здесь можно оставить твой текущий подробный код вкладок overview/history/edit/export/logs,
                      главное — чтобы он был внутри этого фрагмента <>...</> и имел парные скобки */}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно с деталями дневника */}
      {selectedDiary && isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase text-gray-400 mb-1">Дневник подопечного</p>
                <h2 className="text-xl font-semibold text-gray-800">{selectedDiary.patientName}</h2>
                <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
                  <span>Дневник создан: {formatDateTime(selectedDiary.createdAt)}</span>
                  {selectedDiary.organization?.name && <span>Организация: {selectedDiary.organization.name}</span>}
                  {selectedDiary.owner?.name && <span>Владелец: {selectedDiary.owner.name}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 overflow-y-auto space-y-5">
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm text-gray-700">
                <h3 className="text-sm font-semibold text-gray-800">Основная информация</h3>
                <p>
                  <span className="text-xs uppercase text-gray-400">ID дневника: </span>
                  <span className="break-all">{selectedDiary.id}</span>
                </p>
                {selectedDiary.cardId && (
                  <p>
                    <span className="text-xs uppercase text-gray-400">ID карточки: </span>
                    <span className="break-all">{selectedDiary.cardId}</span>
                  </p>
                )}
                {selectedDiary.organization && (
                  <p>
                    <span className="text-xs uppercase text-gray-400">Организация: </span>
                    <span>{selectedDiary.organization.name}</span>
                  </p>
                )}
                {selectedDiary.caregiver && (
                  <p>
                    <span className="text-xs uppercase text-gray-400">Сиделка: </span>
                    <span>{selectedDiary.caregiver.name}</span>
                  </p>
                )}
              </div>

              {selectedDiary.card && (
                <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm text-gray-700">
                  <h3 className="text-sm font-semibold text-gray-800">Карточка подопечного</h3>

                  {selectedDiary.card.full_name && (
                    <p>
                      <span className="text-xs uppercase text-gray-400">ФИО: </span>
                      <span>{selectedDiary.card.full_name}</span>
                    </p>
                  )}

                  {selectedDiary.card.date_of_birth && (
                    <p>
                      <span className="text-xs uppercase text-gray-400">Дата рождения: </span>
                      <span>{formatDate(selectedDiary.card.date_of_birth)}</span>
                    </p>
                  )}

                  {selectedDiary.card.address && (
                    <p>
                      <span className="text-xs uppercase text-gray-400">Адрес: </span>
                      <span>{selectedDiary.card.address}</span>
                    </p>
                  )}

                  {(selectedDiary.card.entrance || selectedDiary.card.apartment) && (
                    <p>
                      <span className="text-xs uppercase text-gray-400">Подъезд / квартира: </span>
                      <span>
                        {selectedDiary.card.entrance && `Подъезд ${selectedDiary.card.entrance}`}
                        {selectedDiary.card.entrance && selectedDiary.card.apartment && ', '}
                        {selectedDiary.card.apartment && `Кв. ${selectedDiary.card.apartment}`}
                      </span>
                    </p>
                  )}

                  {selectedDiary.card.gender && (
                    <p>
                      <span className="text-xs uppercase text-gray-400">Пол: </span>
                      <span>
                        {selectedDiary.card.gender === 'female'
                          ? 'Женский'
                          : selectedDiary.card.gender === 'male'
                          ? 'Мужской'
                          : 'Не указан'}
                      </span>
                    </p>
                  )}

                  {selectedDiary.card.mobility && (
                    <p>
                      <span className="text-xs uppercase text-gray-400">Мобильность: </span>
                      <span>
                        {mobilityLabels[selectedDiary.card.mobility] || selectedDiary.card.mobility}
                      </span>
                    </p>
                  )}

                  <p>
                    <span className="text-xs uppercase text-gray-400">Домашние животные: </span>
                    <span>{selectedDiary.card.has_pets ? 'Да' : 'Нет'}</span>
                  </p>

                  {selectedDiary.card.diagnoses && selectedDiary.card.diagnoses.length > 0 && (
                    <p>
                      <span className="text-xs uppercase text-gray-400">Диагнозы: </span>
                      <span>{selectedDiary.card.diagnoses.join(', ')}</span>
                    </p>
                  )}

                  {selectedDiary.card.services && selectedDiary.card.services.length > 0 && (
                    <p>
                      <span className="text-xs uppercase text-gray-400">Требуемые услуги: </span>
                      <span>{selectedDiary.card.services.join(', ')}</span>
                    </p>
                  )}

                  {selectedDiary.card.service_wishes && selectedDiary.card.service_wishes.length > 0 && (
                    <p>
                      <span className="text-xs uppercase text-gray-400">Пожелания по услугам: </span>
                      <span>{selectedDiary.card.service_wishes.join(', ')}</span>
                    </p>
                  )}
                </div>
              )}

              {historyEntries.length > 0 && (
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3 text-sm text-gray-700">
                  <h3 className="text-sm font-semibold text-gray-800">Последние записи</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {historyEntries
                      .slice()
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .slice(0, 10)
                      .map(entry => (
                        <div key={entry.id} className="border border-gray-100 rounded-2xl px-3 py-2 bg-white">
                          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                            <span>{getMetricLabel(entry.metric_type)}</span>
                            <span>{formatDateTime(entry.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                            {String(entry.value || '')}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


