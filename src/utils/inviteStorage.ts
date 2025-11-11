type InviteUpdater = (current: EmployeeInviteToken) => Partial<EmployeeInviteToken> | EmployeeInviteToken

const EMPLOYEE_INVITE_STORAGE_KEYS = [
  'organization_invite_tokens',
  'employee_invite_tokens',
  'local_employee_invite_tokens',
]

const CANONICAL_STORAGE_KEY = EMPLOYEE_INVITE_STORAGE_KEYS[0]

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const createRandomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `invite_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

const normalizeDate = (value: unknown) => {
  if (!value) {
    return new Date().toISOString()
  }

  const date = new Date(value as any)
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString()
  }

  return date.toISOString()
}

const safeParseJSON = (payload: string | null) => {
  if (!payload) return null
  try {
    return JSON.parse(payload)
  } catch (error) {
    console.warn('inviteStorage: не удалось распарсить JSON', error)
    return null
  }
}

const normalizeEmployeeInviteToken = (raw: any): EmployeeInviteToken | null => {
  if (!raw || (typeof raw !== 'object' && typeof raw !== 'function')) {
    return null
  }

  const now = new Date().toISOString()
  const token = raw.token ? String(raw.token) : raw.id ? String(raw.id) : ''
  if (!token) {
    return null
  }

  const id = raw.id ? String(raw.id) : token || createRandomId()
  const createdAt = normalizeDate(raw.created_at ?? raw.createdAt ?? now)

  const normalized: EmployeeInviteToken = {
    id,
    token,
    organization_id:
      raw.organization_id ??
      raw.organizationId ??
      raw.owner_id ??
      raw.ownerId ??
      raw.caregiver_id ??
      null,
    role: raw.role ?? raw.employee_role ?? raw.employeeRole ?? null,
    created_at: createdAt,
    used_at: raw.used_at ?? raw.usedAt ?? null,
    used_by: raw.used_by ?? raw.usedBy ?? null,
    link: raw.link ?? raw.direct_link ?? raw.url ?? undefined,
  }

  // Сохраняем остальные поля, если они есть
  Object.keys(raw).forEach(key => {
    if (!(key in normalized)) {
      ;(normalized as Record<string, any>)[key] = raw[key]
    }
  })

  return normalized
}

const loadEmployeeInviteTokens = (): { key: string; tokens: EmployeeInviteToken[] } => {
  if (!isBrowser()) {
    return { key: CANONICAL_STORAGE_KEY, tokens: [] }
  }

  for (const key of EMPLOYEE_INVITE_STORAGE_KEYS) {
    const parsed = safeParseJSON(window.localStorage.getItem(key))
    if (Array.isArray(parsed)) {
      const tokens: EmployeeInviteToken[] = parsed
        .map(normalizeEmployeeInviteToken)
        .filter((token): token is EmployeeInviteToken => Boolean(token))

      return { key, tokens }
    }
  }

  return { key: CANONICAL_STORAGE_KEY, tokens: [] }
}

const saveEmployeeInviteTokens = (tokens: EmployeeInviteToken[], key = CANONICAL_STORAGE_KEY) => {
  if (!isBrowser()) return

  try {
    const payload = JSON.stringify(tokens)
    window.localStorage.setItem(key, payload)

    // Очищаем устаревшие ключи, чтобы избежать дублирования
    EMPLOYEE_INVITE_STORAGE_KEYS.forEach(storageKey => {
      if (storageKey !== key && window.localStorage.getItem(storageKey) !== null) {
        window.localStorage.removeItem(storageKey)
      }
    })
  } catch (error) {
    console.warn('inviteStorage: не удалось сохранить токены', error)
  }
}

export type EmployeeInviteToken = {
  id: string
  token: string
  organization_id?: string | null
  role?: string | null
  created_at: string
  used_at?: string | null
  used_by?: string | null
  link?: string
  [key: string]: any
}

export const ensureEmployeeInviteTokens = (): EmployeeInviteToken[] => {
  if (!isBrowser()) return []

  const { key, tokens } = loadEmployeeInviteTokens()

  // Если токены отсутствуют, создаем пустой массив и сохраняем его
  if (!tokens.length) {
    saveEmployeeInviteTokens([], key)
    return []
  }

  saveEmployeeInviteTokens(tokens, key)
  return tokens
}

export const upsertEmployeeInviteToken = (
  payload: Partial<EmployeeInviteToken> & { token: string }
): EmployeeInviteToken[] => {
  if (!isBrowser()) return []

  const { key, tokens } = loadEmployeeInviteTokens()
  const normalized = normalizeEmployeeInviteToken(payload)

  if (!normalized) {
    return tokens
  }

  const index = tokens.findIndex(
    item => item.token === normalized.token || (normalized.id && item.id === normalized.id)
  )

  let nextTokens: EmployeeInviteToken[]
  if (index >= 0) {
    const merged = {
      ...tokens[index],
      ...normalized,
    }
    const mergedNormalized = normalizeEmployeeInviteToken(merged)
    if (!mergedNormalized) {
      return tokens
    }
    nextTokens = [...tokens]
    nextTokens[index] = mergedNormalized
  } else {
    nextTokens = [normalized, ...tokens]
  }

  saveEmployeeInviteTokens(nextTokens, key)
  return nextTokens
}

export const updateEmployeeInviteToken = (
  tokenOrId: string,
  updater: InviteUpdater
): EmployeeInviteToken[] => {
  if (!isBrowser()) return []

  const { key, tokens } = loadEmployeeInviteTokens()
  const index = tokens.findIndex(
    item => item.token === tokenOrId || (tokenOrId && item.id === tokenOrId)
  )

  if (index < 0) {
    return tokens
  }

  const current = tokens[index]
  let updated: Partial<EmployeeInviteToken> | EmployeeInviteToken

  try {
    updated = updater({ ...current })
  } catch (error) {
    console.warn('inviteStorage: не удалось обновить токен', error)
    return tokens
  }

  const normalized = normalizeEmployeeInviteToken({ ...current, ...updated })
  if (!normalized) {
    return tokens
  }

  const nextTokens = [...tokens]
  nextTokens[index] = normalized

  saveEmployeeInviteTokens(nextTokens, key)
  return nextTokens
}

export const deleteEmployeeInviteToken = (tokenOrId: string): EmployeeInviteToken[] => {
  if (!isBrowser()) return []

  const { key, tokens } = loadEmployeeInviteTokens()
  const nextTokens = tokens.filter(
    item => item.token !== tokenOrId && (tokenOrId ? item.id !== tokenOrId : true)
  )

  if (nextTokens.length === tokens.length) {
    return tokens
  }

  saveEmployeeInviteTokens(nextTokens, key)
  return nextTokens
}

