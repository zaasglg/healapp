import { useCallback, useMemo, useState } from 'react'
import { Input, Button } from '@/components/ui'

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

const asArray = (value: any) => (Array.isArray(value) ? value : [])

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

const readObject = (keys: string[]): Record<string, any> => {
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

const loadOrganizations = () => {
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

export const AdminUsersPage = () => {
  const [filter, setFilter] = useState<UserFilter>('all')
  const [search, setSearch] = useState('')
  const [dataVersion, setDataVersion] = useState(0)
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null)
  const [isEditContact, setIsEditContact] = useState(false)
  const [contactValue, setContactValue] = useState('')
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  const diaries = useMemo(() => {
    try {
      const raw = localStorage.getItem('diaries')
      return raw ? JSON.parse(raw) : []
    } catch (error) {
      console.warn('Не удалось загрузить diaries', error)
      return []
    }
  }, [dataVersion])

  const patientCards = useMemo(() => readArray(['patient_cards']), [dataVersion])
  const patientCardMap = useMemo(() => {
    const map = new Map<string, any>()
    patientCards.forEach((card: any) => {
      const id = safeString(card?.id)
      if (id) map.set(id, card)
    })
    return map
  }, [patientCards])

  const diaryAssignments = useMemo(() => readObject(['diary_employee_access']), [dataVersion])

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

    const organizations = loadOrganizations()
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
          sources: ['organizations'],
        })
      } else {
        upsert({
          id: baseId,
          type: 'organization',
          name: org.name || org.title || buildPersonName(org) || 'Организация',
          contact: org.phone || org.email || null,
          roleLabel: organizationTypeLabel(orgType),
          payload: org,
          sources: ['organizations'],
        })
      }
    })

    const localUsers = readArray(['local_users'])
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
        sources: ['local_users'],
      })
    })

    const employees = readArray(['local_employees'])
    employees.forEach((employee: any, index: number) => {
      const id = employee.user_id || employee.id || `employee_${index}`
      upsert({
        id,
        type: 'employee',
        name: buildPersonName(employee) || employee.phone || 'Сотрудник без имени',
        contact: employee.phone || employee.email || null,
        roleLabel: employee.role || 'Сотрудник',
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
        sources: ['local_employees'],
      })
    })

    const privateCaregivers = readArray(['private_caregiver_profiles'])
    privateCaregivers.forEach((caregiver: any, index: number) => {
      const id = caregiver.id || caregiver.user_id || `private_caregiver_${index}`
      const relations: AdminUserRelation[] = []
      if (caregiver.city) {
        relations.push({
          label: 'Город',
          value: String(caregiver.city),
          rawValue: String(caregiver.city),
        })
      }
      upsert({
        id,
        type: 'privateCaregiver',
        name: buildPersonName(caregiver) || caregiver.phone || 'Частная сиделка',
        contact: caregiver.phone || caregiver.email || null,
        roleLabel: 'Частная сиделка',
        relations: relations.length ? relations : undefined,
        payload: caregiver,
        sources: ['private_caregiver_profiles'],
      })
    })

    const localClients = readArray(['local_clients'])
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
        sources: ['local_clients'],
      })
    })

    return Array.from(aggregated.values())
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
  }, [dataVersion])

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

  const handleSaveContact = () => {
    if (!selectedUser) return
    updateLocalStorageRecord(selectedUser, contactValue)
    setIsEditContact(false)
  }

  const handleResetPassword = () => {
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

  const renderModal = () => {
    if (!selectedUser) return null
    const diariesForUser = getUserDiaries(selectedUser)
    const profileName = buildPersonName(selectedUser.payload || {}) || selectedUser.name
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
          <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between gap-6">
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
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs uppercase text-gray-500">Имя</p>
                  <p className="text-sm text-gray-800">{profileName}</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase text-gray-500">Контакты</p>
                      <p className="text-sm text-gray-800">{selectedUser.contact || '—'}</p>
                    </div>
                    {selectedUser.sources.some(source =>
                      ['local_employees', 'local_clients', 'local_users'].includes(source)
                    ) && (
                      <Button variant="outline" size="sm" onClick={() => setIsEditContact(true)}>
                        Изменить
                      </Button>
                    )}
                  </div>
                  {isEditContact && (
                    <div className="space-y-2">
                      <Input
                        value={contactValue}
                        onChange={event => setContactValue(event.target.value)}
                        placeholder="Введите контакт"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveContact}>
                          Сохранить
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setIsEditContact(false)}>
                          Отмена
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs uppercase text-gray-500">Роль</p>
                  <p className="text-sm text-gray-800">{selectedUser.roleLabel || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs uppercase text-gray-500">Источник данных</p>
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
                <div className="flex flex-wrap gap-2">
                  {selectedUser.relations.map(relation => (
                    <span
                      key={`relation-${relation.label}-${relation.value}`}
                      className="inline-flex items-center px-3 py-1 rounded-full bg-[#F7FCFD] text-xs font-medium text-[#0A6D83] border border-[#55ACBF]/30"
                    >
                      {relation.label}: {relation.value}
                    </span>
                  ))}
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

            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-800">Управление</h3>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleResetPassword}>
                  Сбросить пароль
                </Button>
                <Button variant="outline" disabled>
                  Заблокировать доступ
                </Button>
                <Button variant="outline" disabled>
                  Удалить пользователя
                </Button>
              </div>
              {resetMessage && <p className="text-sm text-gray-600">{resetMessage}</p>}
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
          Панель показывает всех, кто имеет отношение к дневникам: организации, сотрудников, частных сиделок и клиентов.
          Используйте карточки-счётчики или поиск, чтобы быстро найти нужного человека, а подробности смотрите в
          карточке профиля.
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
        <section className="space-y-2">
          <p className="text-xs text-gray-500">
            Колонка «Роль и связи» показывает основную роль пользователя и через кого он получил доступ: пригласившую
            сиделку, организацию или другие связанные сущности.
          </p>
        </section>

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
              onClick={() => setDataVersion(prev => prev + 1)}
              className="whitespace-nowrap"
            >
              Обновить данные
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
                      onClick={() => {/* handleRowClick не определен */}}
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

      <div className="text-xs text-gray-400 text-right">
        Шаг 12.3 — собран обзор пользователей из локальных данных, готово к интеграции Supabase
      </div>

      {renderModal()}
    </div>
  )
}


