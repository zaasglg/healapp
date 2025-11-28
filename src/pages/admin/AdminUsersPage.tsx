import { useCallback, useMemo, useState, useEffect } from 'react'
import { Input, Button } from '@/components/ui'
import { getFunctionUrl } from '@/utils/supabaseConfig'

type UserFilter = 'all' | 'organization' | 'employee' | 'privateCaregiver' | 'client'

interface AdminUserRelation {
  label: string
  value: string
  rawValue?: string
}

interface AdminUserRow {
  id: string
  type: UserFilter
  name: string
  contact?: string | null
  roleLabel?: string | null
  sources: string[]
  diariesCount?: number
  relations?: AdminUserRelation[]
  payload?: any
}

const typeLabels: Record<UserFilter, string> = {
  all: 'Все',
  organization: 'Организации',
  employee: 'Сотрудники организаций',
  privateCaregiver: 'Частные сиделки',
  client: 'Клиенты',
}

const TYPE_PRIORITY: Record<UserFilter, number> = {
  organization: 1,
  employee: 2,
  privateCaregiver: 3,
  client: 4,
  all: 99,
}

// const asArray = (value: any) => (Array.isArray(value) ? value : [])

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

const _readObject = (keys: string[]): Record<string, any> => {
  for (const key of keys) {
    if (!key) continue
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    } catch (error) {
      console.warn(`Не удалось прочитать ${key}`, error)
    }
  }
  return {}
}
void _readObject // Prevent unused variable warning

const safeString = (value: any) => (value === undefined || value === null ? '' : String(value))

const joinUnique = (...sources: Array<string | string[] | undefined>) => {
  const set = new Set<string>()
  sources.flat().forEach(item => {
    if (Array.isArray(item)) {
      item.forEach(val => {
        if (val) set.add(String(val))
      })
    } else if (item) {
      set.add(String(item))
    }
  })
  return Array.from(set)
}

const matches = (left: any, right: any) => {
  if (left === undefined || left === null || right === undefined || right === null) {
    return false
  }
  return String(left) === String(right)
}

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
  const { full_name, name, first_name, last_name } = input
  if (full_name && String(full_name).trim().length > 0) return String(full_name).trim()
  if (name && String(name).trim().length > 0) return String(name).trim()
  const combined = `${first_name || ''} ${last_name || ''}`.trim()
  if (combined.length > 0) return combined
  return ''
}

const inferTypeFromUser = (user: any): UserFilter | null => {
  const role = user?.user_role || user?.role
  const organizationType = user?.organization_type || user?.type

  if (role === 'org_employee' || role === 'employee') {
    return 'employee'
  }

  if (role === 'client') {
    return 'client'
  }

  if (role === 'caregiver' || organizationType === 'caregiver') {
    return 'privateCaregiver'
  }

  if (role === 'organization' || organizationType === 'pension' || organizationType === 'patronage_agency') {
    return 'organization'
  }

  return null
}

const _loadOrganizations = () => {
  try {
    const raw = localStorage.getItem('organizations') || localStorage.getItem('admin_organizations')
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch (error) {
    console.warn('Не удалось загрузить organizations', error)
    return []
  }
}
void _loadOrganizations // Prevent unused variable warning

export const AdminUsersPage = () => {
  const [filter, setFilter] = useState<UserFilter>('all')
  const [search, setSearch] = useState('')
  const [dataVersion, setDataVersion] = useState(0)
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null)
  const [_isEditContact, setIsEditContact] = useState(false)
  void _isEditContact // Prevent unused variable warning
  const [contactValue, setContactValue] = useState('')
  const [_resetMessage, setResetMessage] = useState<string | null>(null)
  void _resetMessage // Prevent unused variable warning
  const [isLoading, setIsLoading] = useState(true)
  const [supabaseData, setSupabaseData] = useState<{
    organizations: any[]
    userProfiles: any[]
    clients: any[]
    diaries: any[]
    patientCards: any[]
    diaryEmployeeAccess: any[]
  }>({
    organizations: [],
    userProfiles: [],
    clients: [],
    diaries: [],
    patientCards: [],
    diaryEmployeeAccess: [],
  })

  // Загрузка данных из Supabase через Edge Function
  useEffect(() => {
    const loadSupabaseData = async () => {
      setIsLoading(true)
      try {
        // Получаем админский токен из localStorage
        const adminToken = localStorage.getItem('admin_panel_token')
        if (!adminToken) {
          console.error('Не найден админский токен')
          setIsLoading(false)
          return
        }

        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
        
        if (!supabaseAnonKey) {
          console.error('Не настроен VITE_SUPABASE_ANON_KEY')
          setIsLoading(false)
          return
        }

        // Используем утилиту для получения правильного URL функций
        const functionUrl = getFunctionUrl('admin-users-data')
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

        console.log('✅ Загружены данные из Supabase:', {
          organizations: result.data.organizations?.length || 0,
          userProfiles: result.data.userProfiles?.length || 0,
          clients: result.data.clients?.length || 0,
          diaries: result.data.diaries?.length || 0,
          patientCards: result.data.patientCards?.length || 0,
          diaryEmployeeAccess: result.data.diaryEmployeeAccess?.length || 0,
        })
        
        // Детальное логирование для отладки
        if (result.data.organizations?.length > 0) {
          console.log('📋 Организации из БД:', result.data.organizations)
        }
        if (result.data.userProfiles?.length > 0) {
          console.log('👤 Профили пользователей из БД:', result.data.userProfiles)
        }
        if (result.data.clients?.length > 0) {
          console.log('🏥 Клиенты из БД:', result.data.clients)
        }

        setSupabaseData({
          organizations: result.data.organizations || [],
          userProfiles: result.data.userProfiles || [],
          clients: result.data.clients || [],
          diaries: result.data.diaries || [],
          patientCards: result.data.patientCards || [],
          diaryEmployeeAccess: result.data.diaryEmployeeAccess || [],
        })
      } catch (error) {
        console.error('Ошибка загрузки данных из Supabase:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSupabaseData()
  }, [dataVersion])

  const diaries = useMemo(() => {
    // Используем только данные из Supabase
    return supabaseData.diaries
  }, [dataVersion, supabaseData.diaries])

  const patientCards = useMemo(() => {
    // Используем только данные из Supabase
    return supabaseData.patientCards
  }, [dataVersion, supabaseData.patientCards])
  const patientCardMap = useMemo(() => {
    const map = new Map<string, any>()
    patientCards.forEach((card: any) => {
      const id = safeString(card?.id)
      if (id) map.set(id, card)
    })
    return map
  }, [patientCards])

  const diaryAssignments = useMemo(() => {
    // Используем только данные из Supabase
    const map: Record<string, any[]> = {}
    supabaseData.diaryEmployeeAccess.forEach((access: any) => {
      const diaryId = safeString(access.diary_id)
      if (diaryId) {
        if (!map[diaryId]) map[diaryId] = []
        map[diaryId].push(access)
      }
    })
    return map
  }, [dataVersion, supabaseData.diaryEmployeeAccess])

  const baseRows = useMemo<AdminUserRow[]>(() => {
    type AggregatedEntry = { row: AdminUserRow; priority: number }
    const aggregated = new Map<string, AggregatedEntry>()

    const upsert = (input: Omit<AdminUserRow, 'sources'> & { sources?: string[] }) => {
      const id = safeString(input.id)
      if (!id) return

      const normalized: AdminUserRow = {
        id,
        type: input.type,
        name: input.name || 'Без имени',
        contact: input.contact ?? null,
        roleLabel: input.roleLabel ?? null,
        sources: joinUnique(input.sources || [], [`${input.type}`]),
        diariesCount: input.diariesCount,
        relations: input.relations ? input.relations.map(relation => ({ ...relation })) : [],
        payload: input.payload ?? {},
      }

      const priority = TYPE_PRIORITY[input.type]
      const existing = aggregated.get(id)

      if (!existing) {
        aggregated.set(id, { row: normalized, priority })
        return
      }

      const mergedSources = joinUnique(existing.row.sources, normalized.sources)
      const mergedRelations = [...(existing.row.relations || [])]

      normalized.relations?.forEach(relation => {
        const relationKey = `${relation.label}:${relation.rawValue ?? relation.value}`
        const existsAlready = mergedRelations.some(
          item => `${item.label}:${item.rawValue ?? item.value}` === relationKey
        )
        if (!existsAlready) {
          mergedRelations.push(relation)
        }
      })

      if (priority < existing.priority) {
        aggregated.set(id, {
          priority,
          row: {
            ...existing.row,
            ...normalized,
            contact: normalized.contact ?? existing.row.contact,
            roleLabel: normalized.roleLabel ?? existing.row.roleLabel,
            sources: mergedSources,
            relations: mergedRelations,
            payload: { ...existing.row.payload, ...normalized.payload },
          },
        })
        return
      }

      if (priority === existing.priority) {
        aggregated.set(id, {
          priority,
          row: {
            ...existing.row,
            contact: existing.row.contact || normalized.contact,
            roleLabel: existing.row.roleLabel || normalized.roleLabel,
            sources: mergedSources,
            relations: mergedRelations,
            payload: { ...existing.row.payload, ...normalized.payload },
          },
        })
        return
      }

      aggregated.set(id, {
        priority: existing.priority,
        row: {
          ...existing.row,
          sources: mergedSources,
          relations: mergedRelations,
          contact: existing.row.contact ?? normalized.contact,
          roleLabel: existing.row.roleLabel ?? normalized.roleLabel,
          payload: { ...normalized.payload, ...existing.row.payload },
        },
      })
    }

    // Используем только данные из Supabase
    const organizations = supabaseData.organizations
    organizations.forEach((org: any, index: number) => {
      const baseId = org.id || org.user_id || `org_${index}`
      const orgType = org.type
      if (orgType === 'caregiver') {
        upsert({
          id: baseId,
          type: 'privateCaregiver',
          name: org.name || buildPersonName(org) || 'Частная сиделка',
          contact: org.phone || org.email || null,
          roleLabel: 'Частная сиделка',
        relations: org.city
          ? [{ label: 'Город', value: String(org.city), rawValue: String(org.city) }]
          : undefined,
          payload: org,
          sources: ['supabase', 'organizations'],
        })
      } else {
        upsert({
          id: baseId,
          type: 'organization',
          name: org.name || org.title || buildPersonName(org) || 'Организация',
          contact: org.phone || org.email || null,
          roleLabel: organizationTypeLabel(orgType),
          payload: org,
          sources: ['supabase', 'organizations'],
        })
      }
    })

    // Используем только данные из Supabase
    const supabaseUsers = supabaseData.userProfiles.map((profile: any) => ({
      id: profile.user_id,
      user_id: profile.user_id,
      role: profile.role,
      organization_id: profile.organization_id,
      ...profile,
    }))
    const localUsers = supabaseUsers
    localUsers.forEach((user: any, index: number) => {
      const type = inferTypeFromUser(user)
      if (!type) return
      const id =
        user.id ||
        user.user_id ||
        user.userId ||
        user.phone ||
        user.email ||
        `local_user_${index}`

      const relations: AdminUserRelation[] = []
      if (user.organization_id) {
        relations.push({
          label: 'Организация',
          value: String(user.organization_id),
          rawValue: String(user.organization_id),
        })
      }
      if (user.caregiver_id) {
        relations.push({
          label: 'Сиделка',
          value: String(user.caregiver_id),
          rawValue: String(user.caregiver_id),
        })
      }

      upsert({
        id,
        type,
        name: buildPersonName(user) || user.phone || user.email || 'Без имени',
        contact: user.phone || user.email || null,
        roleLabel:
          type === 'organization'
            ? organizationTypeLabel(user.organization_type || user.type)
            : type === 'employee'
            ? user.role || 'Сотрудник'
            : type === 'privateCaregiver'
            ? 'Частная сиделка'
            : undefined,
        relations: relations.length ? relations : undefined,
        payload: user,
        sources: ['supabase', 'user_profiles'],
      })
    })

    // Используем только данные из Supabase
    const employees = supabaseData.userProfiles
      .filter((profile: any) => profile.role === 'org_employee')
      .map((profile: any) => ({
        user_id: profile.user_id,
        id: profile.user_id,
        organization_id: profile.organization_id,
        employee_role: profile.employee_role || 'caregiver',
        role: profile.employee_role || 'caregiver',
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        ...profile,
      }))
    employees.forEach((employee: any, index: number) => {
      const id = employee.user_id || employee.id || `employee_${index}`
      upsert({
        id,
        type: 'employee',
        name: buildPersonName(employee) || employee.phone || 'Сотрудник без имени',
        contact: employee.phone || employee.email || null,
        roleLabel: employee.role || employee.employee_role || 'Сотрудник',
        relations: employee.organization_id
          ? [
              {
                label: 'Организация',
                value: String(employee.organization_id),
                rawValue: String(employee.organization_id),
              },
            ]
          : undefined,
        payload: employee,
        sources: ['supabase', 'user_profiles'],
      })
    })

    // Частные сиделки уже обработаны в блоке organizations (type='caregiver')
    // Не используем localStorage для частных сиделок

    // Используем только данные из Supabase
    const localClients = supabaseData.clients.map((client: any) => ({
      user_id: client.user_id,
      id: client.user_id || client.id,
      first_name: client.first_name,
      last_name: client.last_name,
      phone: client.phone,
      caregiver_id: client.caregiver_id,
      organization_id: client.organization_id,
      ...client,
    }))
    localClients.forEach((client: any, index: number) => {
      const id = client.user_id || client.id || `client_${index}`
      const relations: AdminUserRelation[] = []
      if (client.caregiver_id) {
        relations.push({
          label: 'Сиделка',
          value: String(client.caregiver_id),
          rawValue: String(client.caregiver_id),
        })
      }
      if (client.organization_id) {
        relations.push({
          label: 'Организация',
          value: String(client.organization_id),
          rawValue: String(client.organization_id),
        })
      }
      upsert({
        id,
        type: 'client',
        name: buildPersonName(client) || client.phone || 'Клиент',
        contact: client.phone || null,
        roleLabel: relations.length ? relations.map(item => item.label).join(' / ') : undefined,
        relations: relations.length ? relations : undefined,
        payload: client,
        sources: ['supabase', 'clients'],
      })
    })

    const rows = Array.from(aggregated.values())
      .map(entry => ({
        ...entry.row,
        relations: entry.row.relations
          ? entry.row.relations.filter(
              (relation, index, self) =>
                relation.value &&
                self.findIndex(item => item.label === relation.label && item.value === relation.value) === index
            )
          : undefined,
      }))
      .sort((a, b) => {
        const priorityDiff = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]
        if (priorityDiff !== 0) return priorityDiff
        return a.name.localeCompare(b.name, 'ru')
      })
    
    console.log('✅ Сформировано строк:', rows.length, 'из них:', {
      organizations: rows.filter(r => r.type === 'organization').length,
      employees: rows.filter(r => r.type === 'employee').length,
      privateCaregivers: rows.filter(r => r.type === 'privateCaregiver').length,
      clients: rows.filter(r => r.type === 'client').length,
    })
    
    return rows
  }, [dataVersion, supabaseData])

  const rowLookup = useMemo(() => {
    const map = new Map<string, AdminUserRow>()
    baseRows.forEach(row => map.set(String(row.id), row))
    return map
  }, [baseRows])

  const organizationNameById = useMemo(() => {
    const map = new Map<string, string>()
    baseRows
      .filter(row => row.type === 'organization')
      .forEach(row => map.set(String(row.id), row.name))
    return map
  }, [baseRows])

  const organizationTypeById = useMemo(() => {
    const map = new Map<string, string | null>()
    baseRows
      .filter(row => row.type === 'organization')
      .forEach(row => {
        const type =
          row.payload?.organization_type || row.payload?.type || row.payload?.role || row.payload?.org_type || null
        if (type) {
          map.set(String(row.id), String(type))
        }
      })
    return map
  }, [baseRows])

  const employeeOrganizationById = useMemo(() => {
    const map = new Map<string, string>()
    baseRows
      .filter(row => row.type === 'employee')
      .forEach(row => {
        const payloadOrg =
          row.payload?.organization_id ||
          row.payload?.organizationId ||
          row.payload?.org_id ||
          row.payload?.organization ||
          null
        const relationOrg = row.relations?.find(relation => relation.label === 'Организация')?.value
        const orgId = payloadOrg || relationOrg
        if (orgId) {
          map.set(String(row.id), String(orgId))
        }
      })
    return map
  }, [baseRows])

  const diariesExtended = useMemo(() => {
    return diaries.map((diary: any) => {
      const patientCardId = diary.patient_card_id ? safeString(diary.patient_card_id) : null
      const patientCard = patientCardId ? patientCardMap.get(patientCardId) : null
      const ownerId = diary.owner_id || diary.client_id
      const ownerKey = ownerId ? safeString(ownerId) : null
      const organizationId = diary.organization_id ? safeString(diary.organization_id) : null
      const caregiverId = diary.caregiver_id ? safeString(diary.caregiver_id) : null
      const assignedRaw = diaryAssignments?.[diary.id]
      const assignedEmployees = Array.isArray(assignedRaw)
        ? assignedRaw.map((item: any) => safeString(item?.user_id || item?.id || item)).filter(Boolean)
        : []

      return {
        ...diary,
        patientCardId,
        patientName: patientCard?.full_name || patientCard?.name || '—',
        ownerId: ownerKey,
        ownerName: ownerKey ? rowLookup.get(ownerKey)?.name || ownerKey : null,
        ownerType: ownerKey ? rowLookup.get(ownerKey)?.type || null : null,
        organizationId,
        organizationName: organizationId ? rowLookup.get(organizationId)?.name || null : null,
        organizationType: organizationId ? organizationTypeById.get(organizationId) || null : null,
        caregiverId,
        caregiverName: caregiverId ? rowLookup.get(caregiverId)?.name || null : null,
        assignedEmployees,
        createdAt: diary.created_at,
      }
    })
  }, [diaries, diaryAssignments, organizationTypeById, patientCardMap, rowLookup])

  const getUserDiaries = useCallback(
    (row: AdminUserRow) => {
      const id = String(row.id)
      switch (row.type) {
        case 'organization':
          return diariesExtended.filter(
            (diary: any) =>
              (diary.organizationId && matches(diary.organizationId, id)) ||
              (diary.ownerId && matches(diary.ownerId, id))
          )
        case 'employee': {
          const organizationId = employeeOrganizationById.get(id)
          return diariesExtended.filter((diary: any) => {
            const explicitMatch = diary.assignedEmployees?.some((employeeId: string) => matches(employeeId, id))
            if (explicitMatch) return true

            if (organizationId && diary.organizationId && matches(diary.organizationId, organizationId)) {
              const hasManualAssignments = diary.assignedEmployees && diary.assignedEmployees.length > 0
              if (!hasManualAssignments) {
                const orgType = diary.organizationType || organizationTypeById.get(organizationId)
                return orgType === 'pension'
              }
            }

            return false
          })
        }
        case 'privateCaregiver':
          return diariesExtended.filter((diary: any) => diary.caregiverId && matches(diary.caregiverId, id))
        case 'client':
          return diariesExtended.filter(
            (diary: any) =>
              (diary.ownerId && matches(diary.ownerId, id)) || (diary.client_id && matches(diary.client_id, id))
          )
        default:
          return []
      }
    },
    [diariesExtended, employeeOrganizationById, organizationTypeById]
  )

  const rows = useMemo<AdminUserRow[]>(() => {
    return baseRows.map(row => {
      const formattedRelations =
        row.relations?.map(relation => {
          const rawValue = relation.rawValue ?? relation.value
          const baseLabel = (() => {
            switch (relation.label) {
              case 'Сиделка':
                return 'Приглашён сиделкой'
              case 'Организация':
                return 'Организация'
              case 'Клиент':
                return 'Клиент'
              case 'Город':
                return 'Город'
              default:
                return relation.label
            }
          })()

          let displayValue = relation.value

          if (relation.label === 'Организация') {
            const related = rawValue ? rowLookup.get(String(rawValue)) : undefined
            displayValue =
              related?.name ??
              organizationNameById.get(String(rawValue)) ??
              (rawValue ? `ID: ${rawValue}` : relation.value)
          } else if (relation.label === 'Сиделка' || relation.label === 'Клиент') {
            const related = rawValue ? rowLookup.get(String(rawValue)) : undefined
            displayValue = related?.name ?? (rawValue ? `ID: ${rawValue}` : relation.value)
          }

          return {
            label: baseLabel,
            value: displayValue,
            rawValue,
          }
        }) || []

      return {
        ...row,
        relations: formattedRelations.length ? formattedRelations : undefined,
        diariesCount: getUserDiaries(row).length,
      }
    })
  }, [baseRows, getUserDiaries, organizationNameById, rowLookup])

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (filter !== 'all' && row.type !== filter) {
        return false
      }

      if (!search.trim()) return true
      const query = search.trim().toLowerCase()
      const searchSpace = [
        row.name,
        row.contact || '',
        row.roleLabel || '',
        row.sources.join(' '),
        ...(row.relations?.map(relation => `${relation.label} ${relation.value}`) || []),
      ]
        .join(' ')
        .toLowerCase()

      return searchSpace.includes(query)
    })
  }, [filter, rows, search])

  const counts = useMemo(() => {
    const base = {
      all: rows.length,
      organization: rows.filter(row => row.type === 'organization').length,
      employee: rows.filter(row => row.type === 'employee').length,
      privateCaregiver: rows.filter(row => row.type === 'privateCaregiver').length,
      client: rows.filter(row => row.type === 'client').length,
    }
    return base
  }, [rows])

  const handleCloseModal = () => {
    setSelectedUser(null)
    setIsEditContact(false)
    setContactValue('')
    setResetMessage(null)
  }

  const handleOpenUser = (row: AdminUserRow) => {
    setSelectedUser(row)
    setContactValue(row.contact || '')
    setResetMessage(null)
  }

  const updateLocalStorageRecord = (row: AdminUserRow, contact: string) => {
    try {
      if (row.sources.includes('local_employees')) {
        const storage = JSON.parse(localStorage.getItem('local_employees') || '[]')
        const updated = storage.map((item: any) => {
          if (String(item.user_id || item.id) === String(row.id)) {
            return { ...item, phone: contact }
          }
          return item
        })
        localStorage.setItem('local_employees', JSON.stringify(updated))
      }

      const hasLocalClients = row.sources.includes('local_clients')
      const hasLocalUsers = row.sources.includes('local_users')

      if (hasLocalClients || hasLocalUsers) {
        const key = hasLocalClients ? 'local_clients' : 'local_users'
        const storage = JSON.parse(localStorage.getItem(key) || '[]')
        const updated = storage.map((item: any) => {
          if (String(item.user_id || item.id) === String(row.id)) {
            return { ...item, phone: contact }
          }
          return item
        })
        localStorage.setItem(key, JSON.stringify(updated))
      }

      setDataVersion(prev => prev + 1)
      setResetMessage('Контактные данные обновлены')
    } catch (error) {
      console.error('Не удалось обновить контактные данные', error)
      setResetMessage('Ошибка при обновлении контактов')
    }
  }

  const _handleSaveContact = () => {
    if (!selectedUser) return
    updateLocalStorageRecord(selectedUser, contactValue)
    setIsEditContact(false)
  }
  void _handleSaveContact // Prevent unused variable warning

  const _handleResetPassword = () => {
    if (!selectedUser) return
    try {
      if (selectedUser.sources.includes('local_users')) {
        const users = JSON.parse(localStorage.getItem('local_users') || '[]')
        const updated = users.map((user: any) => {
          if (String(user.id) === String(selectedUser.id)) {
            return { ...user, password: 'default123' }
          }
          return user
        })
        localStorage.setItem('local_users', JSON.stringify(updated))
        setResetMessage('Пароль сброшен на default123')
      } else {
        setResetMessage('Сброс пароля доступен только для локальных пользователей')
      }
    } catch (error) {
      console.error('Не удалось сбросить пароль', error)
      setResetMessage('Ошибка при сбросе пароля')
    }
  }
  void _handleResetPassword // Prevent unused variable warning

  const renderModal = () => {
    if (!selectedUser) return null
    const diariesForUser = getUserDiaries(selectedUser)
    const payload = selectedUser.payload || {}
    const profileName = buildPersonName(payload) || selectedUser.name
    
    // Извлекаем дополнительные данные в зависимости от типа пользователя
    const getAdditionalFields = () => {
      switch (selectedUser.type) {
        case 'organization': {
          return {
            organizationType: payload.type || payload.organization_type,
            address: payload.address,
            city: payload.city,
            email: payload.email || (selectedUser.contact?.includes('@') ? selectedUser.contact : null),
            phone: payload.phone || (selectedUser.contact?.includes('@') ? null : selectedUser.contact),
            userId: payload.user_id || selectedUser.id,
            organizationId: payload.id,
            createdAt: payload.created_at,
            updatedAt: payload.updated_at,
          }
        }
        case 'employee': {
          return {
            firstName: payload.first_name,
            lastName: payload.last_name,
            phone: payload.phone || selectedUser.contact,
            email: payload.email || (selectedUser.contact?.includes('@') ? selectedUser.contact : null),
            employeeRole: payload.employee_role || payload.role,
            organizationId: payload.organization_id,
            userId: payload.user_id || selectedUser.id,
            createdAt: payload.created_at,
            updatedAt: payload.updated_at,
          }
        }
        case 'privateCaregiver': {
          return {
            firstName: payload.first_name,
            lastName: payload.last_name,
            phone: payload.phone || selectedUser.contact,
            email: payload.email || (selectedUser.contact?.includes('@') ? selectedUser.contact : null),
            city: payload.city,
            userId: payload.user_id || selectedUser.id,
            organizationId: payload.id,
            createdAt: payload.created_at,
            updatedAt: payload.updated_at,
          }
        }
        case 'client': {
          return {
            firstName: payload.first_name,
            lastName: payload.last_name,
            phone: payload.phone || selectedUser.contact,
            email: payload.email || (selectedUser.contact?.includes('@') ? selectedUser.contact : null),
            caregiverId: payload.caregiver_id,
            organizationId: payload.organization_id,
            userId: payload.user_id || selectedUser.id,
            createdAt: payload.created_at,
            updatedAt: payload.updated_at,
          }
        }
        default:
          return {}
      }
    }
    
    const additionalFields = getAdditionalFields()
    
    const describeAccess = (diary: any) => {
      switch (selectedUser.type) {
        case 'organization':
          return diary.ownerId && matches(diary.ownerId, selectedUser.id)
            ? 'Владелец'
            : 'Организация с доступом'
        case 'employee': {
          const explicit = diary.assignedEmployees?.some((employeeId: string) => matches(employeeId, selectedUser.id))
          return explicit ? 'Назначен к дневнику' : 'Доступ по организации'
        }
        case 'privateCaregiver':
          return 'Сиделка с доступом'
        case 'client':
          return diary.ownerId && matches(diary.ownerId, selectedUser.id) ? 'Владелец' : 'Читатель'
        default:
          return ''
      }
    }

    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="px-6 pb-5 pt-0 border-b border-gray-200 flex items-center justify-between gap-6">
            <div className="flex-1">
              <p className="text-xs uppercase text-gray-400">{typeLabels[selectedUser.type]}</p>
              <h2 className="text-xl font-semibold text-gray-800">{selectedUser.name}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="inline-flex items-center px-2 py-1 rounded-full bg-[#55ACBF]/10 text-xs font-semibold text-[#0A6D83]">
                  {typeLabels[selectedUser.type]}
                </span>
                <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                  Дневников: {diariesForUser.length}
                </span>
                {selectedUser.sources.map(source => (
                  <span
                    key={`modal-chip-${source}`}
                    className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-[11px] font-medium text-gray-600"
                  >
                    {source}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={handleCloseModal}
              className="text-gray-500 hover:text-gray-700 text-lg"
            >
              ✕
            </button>
          </div>
          <div className="px-6 py-5 overflow-y-auto space-y-6">
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-800">Профиль</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Основная информация */}
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs uppercase text-gray-500 mb-1">Название / Имя</p>
                  <p className="text-sm font-medium text-gray-800">{profileName || '—'}</p>
                  {selectedUser.type === 'organization' && additionalFields.organizationType && (
                    <p className="text-xs text-gray-500 mt-1">
                      Тип: {organizationTypeLabel(additionalFields.organizationType)}
                    </p>
                  )}
                  {(selectedUser.type === 'employee' || selectedUser.type === 'privateCaregiver' || selectedUser.type === 'client') && (
                    <div className="mt-1 space-y-0.5">
                      {additionalFields.firstName && (
                        <p className="text-xs text-gray-500">Имя: {additionalFields.firstName}</p>
                      )}
                      {additionalFields.lastName && (
                        <p className="text-xs text-gray-500">Фамилия: {additionalFields.lastName}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Контакты */}
                <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                  <div>
                    <p className="text-xs uppercase text-gray-500 mb-1">Контакты</p>
                    <div className="space-y-1">
                      {additionalFields.phone && (
                        <p className="text-sm text-gray-800">
                          📞 {additionalFields.phone}
                        </p>
                      )}
                      {additionalFields.email && (
                        <p className="text-sm text-gray-800">
                          ✉️ {additionalFields.email}
                        </p>
                      )}
                      {!additionalFields.phone && !additionalFields.email && (
                        <p className="text-sm text-gray-500">{selectedUser.contact || '—'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Роль / Тип */}
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs uppercase text-gray-500 mb-1">Роль / Тип</p>
                  <p className="text-sm font-medium text-gray-800">{selectedUser.roleLabel || '—'}</p>
                  {selectedUser.type === 'employee' && additionalFields.employeeRole && (
                    <p className="text-xs text-gray-500 mt-1">
                      Должность: {additionalFields.employeeRole === 'manager' ? 'Руководитель' : 
                                  additionalFields.employeeRole === 'caregiver' ? 'Сиделка' : 
                                  additionalFields.employeeRole === 'doctor' ? 'Врач' : 
                                  additionalFields.employeeRole}
                    </p>
                  )}
                </div>

                {/* Дополнительная информация в зависимости от типа */}
                {selectedUser.type === 'organization' && (
                  <>
                    {additionalFields.address && (
                      <div className="bg-gray-50 rounded-2xl p-4">
                        <p className="text-xs uppercase text-gray-500 mb-1">Адрес</p>
                        <p className="text-sm text-gray-800">{additionalFields.address}</p>
                      </div>
                    )}
                    {additionalFields.city && (
                      <div className="bg-gray-50 rounded-2xl p-4">
                        <p className="text-xs uppercase text-gray-500 mb-1">Город</p>
                        <p className="text-sm text-gray-800">{additionalFields.city}</p>
                      </div>
                    )}
                  </>
                )}

                {selectedUser.type === 'privateCaregiver' && additionalFields.city && (
                  <div className="bg-gray-50 rounded-2xl p-4">
                    <p className="text-xs uppercase text-gray-500 mb-1">Город</p>
                    <p className="text-sm text-gray-800">{additionalFields.city}</p>
                  </div>
                )}

                {/* Идентификаторы */}
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs uppercase text-gray-500 mb-1">Идентификаторы</p>
                  <div className="space-y-1">
                    {additionalFields.userId && (
                      <p className="text-xs text-gray-600 break-all">
                        User ID: <span className="font-mono">{additionalFields.userId}</span>
                      </p>
                    )}
                    {additionalFields.organizationId && selectedUser.type === 'organization' && (
                      <p className="text-xs text-gray-600 break-all">
                        Org ID: <span className="font-mono">{additionalFields.organizationId}</span>
                      </p>
                    )}
                    {additionalFields.organizationId && selectedUser.type === 'employee' && (
                      <p className="text-xs text-gray-600 break-all">
                        Организация ID: <span className="font-mono">{additionalFields.organizationId}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Даты создания/обновления */}
                {(additionalFields.createdAt || additionalFields.updatedAt) && (
                  <div className="bg-gray-50 rounded-2xl p-4">
                    <p className="text-xs uppercase text-gray-500 mb-1">Даты</p>
                    <div className="space-y-1">
                      {additionalFields.createdAt && (
                        <p className="text-xs text-gray-600">
                          Создан: {new Date(additionalFields.createdAt).toLocaleString('ru-RU')}
                        </p>
                      )}
                      {additionalFields.updatedAt && (
                        <p className="text-xs text-gray-600">
                          Обновлён: {new Date(additionalFields.updatedAt).toLocaleString('ru-RU')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Источник данных */}
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs uppercase text-gray-500 mb-1">Источник данных</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedUser.sources.map(source => (
                      <span
                        key={source}
                        className="inline-flex items-center px-2 py-1 rounded-full bg-white text-xs font-medium text-[#0A6D83] border border-[#55ACBF]/40"
                      >
                        {source}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {selectedUser.relations && selectedUser.relations.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-800">Связанные сущности</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedUser.relations.map(relation => {
                    const relatedEntity = relation.rawValue ? rowLookup.get(String(relation.rawValue)) : undefined
                    return (
                      <div
                        key={`relation-${relation.label}-${relation.value}`}
                        className="bg-gray-50 rounded-2xl p-4"
                      >
                        <p className="text-xs uppercase text-gray-500 mb-1">{relation.label}</p>
                        <p className="text-sm font-medium text-gray-800">{relation.value}</p>
                        {relatedEntity && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white text-[10px] font-medium text-gray-600 border border-gray-200">
                              {typeLabels[relatedEntity.type]}
                            </span>
                            {relatedEntity.contact && (
                              <span className="text-[10px] text-gray-500">{relatedEntity.contact}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
            
            {/* Дополнительная информация для клиентов */}
            {selectedUser.type === 'client' && (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-800">Связи клиента</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {additionalFields.caregiverId && (
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <p className="text-xs uppercase text-gray-500 mb-1">Приглашён сиделкой</p>
                      {(() => {
                        const caregiver = rowLookup.get(String(additionalFields.caregiverId))
                        return caregiver ? (
                          <>
                            <p className="text-sm font-medium text-gray-800">{caregiver.name}</p>
                            {caregiver.contact && (
                              <p className="text-xs text-gray-500 mt-1">{caregiver.contact}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-gray-600 break-all">
                            ID: <span className="font-mono">{additionalFields.caregiverId}</span>
                          </p>
                        )
                      })()}
                    </div>
                  )}
                  {additionalFields.organizationId && (
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <p className="text-xs uppercase text-gray-500 mb-1">Организация</p>
                      {(() => {
                        const org = rowLookup.get(String(additionalFields.organizationId))
                        return org ? (
                          <>
                            <p className="text-sm font-medium text-gray-800">{org.name}</p>
                            {org.contact && (
                              <p className="text-xs text-gray-500 mt-1">{org.contact}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-gray-600 break-all">
                            ID: <span className="font-mono">{additionalFields.organizationId}</span>
                          </p>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">Доступ к дневникам</h3>
                <span className="text-sm text-gray-500">Всего: {diariesForUser.length}</span>
              </div>
              <div className="border border-gray-200 rounded-2xl overflow-x-auto hidden md:block">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-[#F7FCFD] text-gray-500 uppercase tracking-wide text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">ID дневника</th>
                      <th className="px-4 py-3 text-left">Подопечный</th>
                      <th className="px-4 py-3 text-left">Владелец</th>
                      <th className="px-4 py-3 text-left">Роль</th>
                      <th className="px-4 py-3 text-left">Организация</th>
                      <th className="px-4 py-3 text-left">Создан</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {diariesForUser.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                          Связанных дневников пока нет
                        </td>
                      </tr>
                    ) : (
                      diariesForUser.map((diary: any) => (
                        <tr key={diary.id}>
                          <td className="px-4 py-3 font-mono text-xs text-gray-700 break-all">{diary.id}</td>
                          <td className="px-4 py-3 text-gray-700">
                            <div className="space-y-1">
                              <span className="font-medium text-sm">{diary.patientName || '—'}</span>
                              {diary.patientCardId && (
                                <div className="text-xs text-gray-400 break-all leading-tight">
                                  Карточка:
                                  <div className="mt-1">{diary.patientCardId}</div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            <div className="space-y-1">
                              <span className="font-medium text-sm">{diary.ownerName || '—'}</span>
                              {diary.ownerType && (
                                <span className="text-xs text-gray-400">
                                  {typeLabels[diary.ownerType as UserFilter] || diary.ownerType}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                              {describeAccess(diary)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {diary.organizationName ? (
                              <div className="space-y-1">
                                <span className="text-sm">{diary.organizationName}</span>
                                {diary.organizationId && (
                                  <span className="text-xs text-gray-400 break-all">ID: {diary.organizationId}</span>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {diary.created_at ? new Date(diary.created_at).toLocaleString('ru-RU') : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-3">
                {diariesForUser.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500 text-center">
                    Связанных дневников пока нет
                  </div>
                ) : (
                  diariesForUser.map((diary: any) => (
                    <div
                      key={`${selectedUser?.id}-diary-${diary.id}`}
                      className="rounded-2xl border border-gray-200 bg-white p-5 flex flex-col gap-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{diary.patientName || 'Без названия'}</p>
                          <p className="text-xs text-gray-400 break-all mt-1">
                            Дневник: <span className="font-mono">{diary.id}</span>
                          </p>
                        </div>
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                          {describeAccess(diary)}
                        </span>
                      </div>
                      {diary.patientCardId && (
                        <p className="text-xs text-gray-500 break-all">
                          Карточка: <span className="font-mono">{diary.patientCardId}</span>
                        </p>
                      )}
                      <div className="grid grid-cols-1 gap-2 text-sm text-gray-600">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Владелец</p>
                          <p className="font-medium">{diary.ownerName || '—'}</p>
                          {diary.ownerType && (
                            <p className="text-xs text-gray-400">
                              {typeLabels[diary.ownerType as UserFilter] || diary.ownerType}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Организация</p>
                          {diary.organizationName ? (
                            <>
                              <p className="font-medium">{diary.organizationName}</p>
                              {diary.organizationId && (
                                <p className="text-xs text-gray-400 break-all">ID: {diary.organizationId}</p>
                              )}
                            </>
                          ) : (
                            <p className="text-gray-400">—</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Создан</p>
                          <p>{diary.created_at ? new Date(diary.created_at).toLocaleString('ru-RU') : '—'}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Управление - только для админов, функционал будет реализован позже */}
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-800">Управление</h3>
              <div className="bg-gray-50 rounded-2xl p-4">
                <p className="text-sm text-gray-600">
                  Функции управления пользователями будут доступны в следующих версиях админ-панели.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-800">Пользователи и доступы</h2>
        <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
          Просмотр организаций, сотрудников и клиентов, анализ их активности.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(typeLabels) as Array<UserFilter>).map(type => (
          <div
            key={type}
            role="button"
            tabIndex={0}
            onClick={() => setFilter(type)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setFilter(type)
              }
            }}
            className={`rounded-3xl border p-5 shadow-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#55ACBF] focus:ring-offset-2 ${
              filter === type ? 'border-[#55ACBF] bg-[#F7FCFD]' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{typeLabels[type]}</p>
              {filter === type && (
                <span className="text-[10px] font-semibold text-[#0A6D83] bg-[#0A6D83]/10 px-2 py-0.5 rounded-full">
                  Активно
                </span>
              )}
            </div>
            <p className="text-2xl font-semibold text-gray-800 mt-1">{type === 'all' ? counts.all : counts[type]}</p>
            <p className="text-[11px] text-gray-400 mt-2">
              {type === 'all'
                ? 'Всего профилей'
                : type === 'organization'
                ? 'Партнёрские организации'
                : type === 'employee'
                ? 'Внутренние специалисты'
                : type === 'privateCaregiver'
                ? 'Приглашённые частные сиделки'
                : 'Активные клиенты'}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-6 shadow-sm">

        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Поиск по имени, телефону, связям или источнику..."
              className="sm:w-72 w-full"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              {(Object.keys(typeLabels) as Array<UserFilter>).map(type => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`px-3 py-1 rounded-full border transition-colors whitespace-normal text-left leading-tight max-w-[160px] ${
                    filter === type
                      ? 'bg-[#55ACBF]/10 text-[#0A6D83] border-[#55ACBF]'
                      : 'border-gray-200 text-gray-500 hover:text-[#0A6D83] hover:border-[#55ACBF]/40'
                  }`}
                >
                  {typeLabels[type]}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDataVersion(prev => prev + 1)
                setIsLoading(true)
              }}
              className="whitespace-nowrap"
              disabled={isLoading}
            >
              {isLoading ? 'Загрузка...' : 'Обновить данные'}
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="overflow-hidden border border-gray-200 rounded-2xl overflow-x-auto hidden lg:block">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-[#F7FCFD] text-gray-500 uppercase tracking-wide text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Тип</th>
                  <th className="px-4 py-3 text-left">Имя</th>
                  <th className="px-4 py-3 text-left">Контакты</th>
                  <th className="px-4 py-3 text-left">Роль и связи</th>
                  <th className="px-4 py-3 text-left">Доступ к дневникам</th>
                  <th className="px-4 py-3 text-left">Источник данных</th>
                  <th className="px-4 py-3 text-left">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      Пользователи не найдены. Измените фильтр или обновите данные.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map(row => (
                    <tr key={`${row.type}-${row.id}`}>
                      <td className="px-4 py-3 text-gray-800">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-[#F7FCFD] text-[#0A6D83] border border-[#55ACBF]/40">
                          {row.type === 'organization'
                            ? 'Организация'
                            : row.type === 'employee'
                            ? 'Сотрудник'
                            : row.type === 'privateCaregiver'
                            ? 'Частная сиделка'
                            : 'Клиент'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">
                        <div className="space-y-1">
                          <span>{row.name}</span>
                          <span className="text-xs text-gray-400 break-all">ID: {row.id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.contact || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-700">
                            {row.roleLabel ? `Роль: ${row.roleLabel}` : 'Роль не указана'}
                          </p>
                          {row.relations && row.relations.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {row.relations.map(relation => (
                                <span
                                  key={`${row.id}-${relation.label}-${relation.value}`}
                                  className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] text-[#0A6D83] bg-[#E5F4F7]"
                                >
                                  {relation.label}: {relation.value}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Дополнительных связей нет</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-full text-xs font-semibold ${
                            (row.diariesCount ?? 0) > 0
                              ? 'bg-[#55ACBF]/10 text-[#0A6D83]'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {row.diariesCount ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.sources.map(source => (
                            <span
                              key={`${row.id}-${source}`}
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-[#F1F5F9] text-gray-600 border border-slate-200"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                              {source}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="outline" size="sm" onClick={() => handleOpenUser(row)}>
                          Подробнее
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden space-y-3">
            {filteredRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500 text-center">
                Пользователи не найдены. Измените фильтр или обновите данные.
              </div>
            ) : (
              filteredRows.map(row => (
                <div
                  key={`${row.type}-${row.id}-card`}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F7FCFD] text-[#0A6D83] border border-[#55ACBF]/40">
                      {row.type === 'organization'
                        ? 'Организация'
                        : row.type === 'employee'
                        ? 'Сотрудник'
                        : row.type === 'privateCaregiver'
                        ? 'Частная сиделка'
                        : 'Клиент'}
                    </span>
                    <button
                      onClick={() => handleOpenUser(row)}
                      className="text-xs font-semibold text-[#0A6D83] underline underline-offset-4"
                    >
                      Открыть профиль
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-base font-semibold text-gray-800">{row.name}</p>
                    <p className="text-xs text-gray-400 break-all">ID: {row.id}</p>
                    <p className="text-sm text-gray-600">{row.contact || 'Контакты не указаны'}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Роль и связи</p>
                    <div className="space-y-1.5">
                      <p className="text-sm text-gray-700">
                        {row.roleLabel ? `Роль: ${row.roleLabel}` : 'Роль не указана'}
                      </p>
                      {row.relations && row.relations.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {row.relations.map(relation => (
                            <span
                              key={`${row.id}-${relation.label}-${relation.value}-card`}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] text-[#0A6D83] bg-[#E5F4F7]"
                            >
                              {relation.label}: {relation.value}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Дополнительных связей нет</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div>
                      Доступ к дневникам:{' '}
                      <span className="font-semibold text-[#0A6D83]">{row.diariesCount ?? 0}</span>
                    </div>
                    <span className="text-right max-w-[50%]">
                      Источники: {row.sources.length ? row.sources.join(', ') : '—'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>


      {renderModal()}
    </div>
  )
}


