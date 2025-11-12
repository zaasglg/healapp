import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Select } from '@/components/ui'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'

type OrganizationType = 'pension' | 'patronage_agency' | 'caregiver' | null

type EmployeeRecord = {
  user_id: string
  organization_id: string | null
  organization_type?: OrganizationType | null
  first_name?: string
  last_name?: string
  phone?: string | null
  role?: string | null
  created_at?: string
}

type InviteToken = {
  id: string
  token: string
  invite_type: string
  created_at: string
  expires_at: string | null
  used_at: string | null
  revoked_at: string | null
  organization_invite_tokens?: {
    organization_id: string
    organization_type: string
    employee_role: string
  } | null
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Администратор' },
  { value: 'manager', label: 'Руководитель' },
  { value: 'caregiver', label: 'Сиделка' },
  { value: 'doctor', label: 'Врач' },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  manager: 'Руководитель',
  caregiver: 'Сиделка',
  doctor: 'Врач',
}

const formatDate = (iso: string | undefined) => {
  if (!iso) return 'Неизвестно'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Неизвестно'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const buildInviteLink = (token: string) => {
  if (typeof window === 'undefined') return token
  return `${window.location.origin}/register?org_token=${token}`
}

const normalizeId = (value: unknown) => {
  if (value === null || value === undefined) return null
  const stringValue = String(value)
  if (
    stringValue === 'null' ||
    stringValue === 'undefined' ||
    stringValue.trim() === ''
  ) {
    return null
  }
  return stringValue
}

const isOrganization = (type: OrganizationType | undefined | null): type is 'pension' | 'patronage_agency' =>
  type === 'pension' || type === 'patronage_agency'

export const EmployeesPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [organizationType, setOrganizationType] = useState<OrganizationType>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [organizationAltIds, setOrganizationAltIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [invites, setInvites] = useState<InviteToken[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>(ROLE_OPTIONS[0]?.value ?? 'caregiver')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [activationNotice, setActivationNotice] = useState<{ role?: string | null; used_at?: string | null } | null>(
    null
  )

  const loadEmployees = useCallback(
    async (orgId: string | null) => {
      if (!orgId) {
        setEmployees([])
        return
      }

      try {
        const { data, error } = await supabase
          .from('organization_employees')
          .select(`
            user_id,
            organization_id,
            first_name,
            last_name,
            phone,
            role,
            created_at,
            organizations!inner (
              organization_type
            )
          `)
          .eq('organization_id', orgId)

        if (error) {
          console.error('Ошибка загрузки сотрудников:', error)
          setEmployees([])
          return
        }

        setEmployees(
          (data || []).map((item: any) => ({
            user_id: item.user_id,
            organization_id: item.organization_id,
            organization_type: item.organizations?.organization_type || null,
            first_name: item.first_name || '',
            last_name: item.last_name || '',
            phone: item.phone || null,
            role: item.role || null,
            created_at: item.created_at,
          }))
        )
      } catch (loadError) {
        console.error('Не удалось загрузить сотрудников:', loadError)
        setEmployees([])
      }
    },
    []
  )

  const loadInvites = useCallback(
    async (orgId: string | null) => {
      if (!orgId) {
        setInvites([])
        return
      }

      try {
        const { data, error } = await supabase
          .from('invite_tokens')
          .select(`
            id,
            token,
            invite_type,
            created_at,
            expires_at,
            used_at,
            revoked_at,
            organization_invite_tokens (
              organization_id,
              organization_type,
              employee_role
            )
          `)
          .eq('invite_type', 'organization_employee')
          .is('revoked_at', null)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Ошибка загрузки приглашений:', error)
          setInvites([])
          return
        }

        // Фильтруем приглашения по organization_id
        const filteredInvites = (data || [])
          .filter((invite: any) => {
            const inviteOrgId = invite.organization_invite_tokens?.organization_id
            return inviteOrgId === orgId
          })
          .map((invite: any) => ({
            id: invite.id,
            token: invite.token,
            invite_type: invite.invite_type,
            created_at: invite.created_at,
            expires_at: invite.expires_at,
            used_at: invite.used_at,
            revoked_at: invite.revoked_at,
            organization_invite_tokens: invite.organization_invite_tokens,
          }))

        // Разделяем на активные и использованные
        const activeInvites = filteredInvites.filter((invite: InviteToken) => !invite.used_at)
        const usedInvites = filteredInvites.filter((invite: InviteToken) => invite.used_at)

        // Показываем уведомление о последнем использованном приглашении
        if (usedInvites.length > 0) {
          const latest = usedInvites.reduce((acc, item) => {
            if (!acc) return item
            if (!item.used_at) return acc
            if (!acc.used_at) return item
            return new Date(item.used_at) > new Date(acc.used_at) ? item : acc
          }, usedInvites[0])

          setActivationNotice({
            role: latest?.organization_invite_tokens?.employee_role || null,
            used_at: latest?.used_at || null,
          })
        }

        setInvites(activeInvites)
      } catch (loadError) {
        console.error('Не удалось загрузить приглашения:', loadError)
        setInvites([])
      }
    },
    []
  )

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    const orgType = (user.user_metadata?.organization_type ?? null) as OrganizationType
    const userRole = user.user_metadata?.user_role as string | undefined

    if (!isOrganization(orgType)) {
      if (userRole === 'org_employee') {
        navigate('/dashboard')
      } else {
        setError('Эта страница доступна только организациям.')
      }
      setIsLoading(false)
      return
    }

    let currentUserOrgId: string | null = null
    try {
      const rawCurrentUser = localStorage.getItem('current_user')
      if (rawCurrentUser) {
        const parsed = JSON.parse(rawCurrentUser)
        currentUserOrgId = normalizeId(parsed?.organization_id)
      }
    } catch (storageError) {
      console.warn('Не удалось прочитать current_user для EmployeesPage', storageError)
    }

    const canonicalOrganizationId =
      normalizeId(user.id) ||
      normalizeId((user as any)?.user_id) ||
      normalizeId(currentUserOrgId)
    const metadataOrganizationId =
      normalizeId((user as any).organization_id) ||
      normalizeId(user.user_metadata?.organization_id) ||
      normalizeId(currentUserOrgId)

    const derivedOrganizationId = canonicalOrganizationId || metadataOrganizationId
    const alternativeOrganizationIds: string[] = []
    if (metadataOrganizationId && metadataOrganizationId !== derivedOrganizationId) {
      alternativeOrganizationIds.push(metadataOrganizationId)
    }
    if (
      currentUserOrgId &&
      currentUserOrgId !== derivedOrganizationId &&
      !alternativeOrganizationIds.includes(currentUserOrgId)
    ) {
      alternativeOrganizationIds.push(currentUserOrgId)
    }

    setOrganizationType(orgType)
    setOrganizationId(derivedOrganizationId)
    setOrganizationAltIds(alternativeOrganizationIds)
    
    // Загружаем данные из Supabase
    Promise.all([
      loadEmployees(derivedOrganizationId),
      loadInvites(derivedOrganizationId),
    ]).finally(() => {
      setIsLoading(false)
    })
  }, [user, navigate, loadEmployees, loadInvites])

  useEffect(() => {
    if (!activationNotice) return
    const timeout = setTimeout(() => setActivationNotice(null), 5000)
    return () => clearTimeout(timeout)
  }, [activationNotice])

  const handleCopyInvite = async (token: string) => {
    try {
      const link = buildInviteLink(token)
      await navigator.clipboard.writeText(link)
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch (copyError) {
      console.warn('Не удалось скопировать ссылку', copyError)
      setError('Не удалось скопировать ссылку. Попробуйте ещё раз.')
    }
  }

  const handleRemoveEmployee = async (employeeUserId: string) => {
    if (!employeeUserId) return
    const confirmed = window.confirm('Удалить сотрудника и отозвать его доступ?')
    if (!confirmed) return

    try {
      // Удаляем сотрудника из организации
      const { error: deleteError } = await supabase
        .from('organization_employees')
        .delete()
        .eq('user_id', employeeUserId)
        .eq('organization_id', organizationId)

      if (deleteError) {
        console.error('Ошибка удаления сотрудника:', deleteError)
        setError('Не удалось удалить сотрудника. Попробуйте позже.')
        return
      }

      // Перезагружаем список сотрудников
      await loadEmployees(organizationId)
    } catch (removeError) {
      console.error('Не удалось удалить сотрудника', removeError)
      setError('Не удалось удалить сотрудника. Попробуйте позже.')
    }
  }

  const handleDeleteInvite = async (inviteId: string) => {
    const confirmed = window.confirm('Удалить пригласительную ссылку?')
    if (!confirmed) return

    try {
      const { error } = await supabase.rpc('revoke_invite_link', {
        p_invite_id: inviteId,
      })

      if (error) {
        console.error('Ошибка отзыва приглашения:', error)
        setError('Не удалось отозвать приглашение. Попробуйте позже.')
        return
      }

      // Перезагружаем список приглашений
      await loadInvites(organizationId)
    } catch (deleteError) {
      console.error('Ошибка при отзыве приглашения:', deleteError)
      setError('Не удалось отозвать приглашение. Попробуйте позже.')
    }
  }

  const handleGenerateInvite = async () => {
    if (!organizationId) {
      setError('Не удалось определить организацию. Обновите страницу и попробуйте снова.')
      return
    }

    setIsGenerating(true)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('generate_invite_link', {
        invite_type: 'organization_employee',
        payload: {
          employee_role: selectedRole,
        },
      })

      if (error) {
        console.error('Ошибка создания приглашения:', error)
        setError(error.message || 'Не удалось создать пригласительную ссылку. Попробуйте позже.')
        return
      }

      if (!data || !data.token) {
        setError('Не удалось создать пригласительную ссылку. Попробуйте позже.')
        return
      }

      const link = buildInviteLink(data.token)

      // Перезагружаем список приглашений
      await loadInvites(organizationId)
      
      setCopiedToken(data.token)
      await navigator.clipboard.writeText(link)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch (generateError) {
      console.error('Не удалось создать пригласительную ссылку', generateError)
      setError('Не удалось создать пригласительную ссылку. Попробуйте позже.')
    } finally {
      setIsGenerating(false)
    }
  }


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка сотрудников...</p>
        </div>
      </div>
    )
  }

  if (error && !organizationId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-100">
        <div className="max-w-sm text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-dark mb-3">Нет доступа</h1>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <Button onClick={() => navigate('/profile')} fullWidth size="lg">
            Вернуться в профиль
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white">
        <div className="flex items-center px-4 py-3 relative">
          <button onClick={() => navigate('/profile')} className="mr-4 p-2 -ml-2" aria-label="Назад">
            <img src="/icons/Иконка стрелка.png" alt="Назад" className="w-6 h-6 object-contain" />
          </button>
          <h1 className="absolute left-1/2 transform -translate-x-1/2 text-lg font-bold text-gray-dark">
            Сотрудники
          </h1>
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 pb-10">
        {error && organizationId && (
          <div className="bg-red-50 border border-red-200 text-sm text-red-600 rounded-xl p-3 mt-4">
            {error}
          </div>
        )}

        {activationNotice && (
          <div className="mt-4 bg-green-50 border border-green-200 text-sm text-green-700 rounded-xl p-3">
            <p className="font-semibold">
              Сотрудник успешно зарегистрировался
            </p>
            <p className="mt-1 text-xs text-green-600">
              Роль: {ROLE_LABELS[activationNotice.role || ''] || 'Сотрудник'}, время: {formatDate(activationNotice.used_at)}
            </p>
          </div>
        )}

        <section className="mt-6 bg-white rounded-2xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-dark mb-4">Пригласить специалиста</h2>
          <div className="space-y-4">
            <Select
              label="Выберите роль"
              fullWidth
              value={selectedRole}
              onChange={event => setSelectedRole(event.target.value)}
              options={ROLE_OPTIONS}
            />
            <Button onClick={handleGenerateInvite} fullWidth size="lg" isLoading={isGenerating} disabled={isGenerating}>
              {isGenerating ? 'Создание ссылки...' : 'Создать пригласительную ссылку'}
            </Button>
            <p className="text-xs text-gray-500">
              Ссылка создаётся мгновенно и автоматически копируется. Передайте её сотруднику в удобном мессенджере.
            </p>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold text-gray-dark mb-3">Активные приглашения</h2>
          {invites.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm px-4 py-6 text-center text-sm text-gray-500">
              Активных приглашений нет. Создайте новую ссылку, чтобы пригласить специалиста.
            </div>
          ) : (
            <div className="space-y-4">
              {invites.map(invite => {
                const token = invite.token
                const link = buildInviteLink(invite.token)
                const role = invite.organization_invite_tokens?.employee_role || ''
                return (
                  <div key={invite.id} className="bg-white rounded-2xl shadow-sm p-4">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-dark">
                          {ROLE_LABELS[role] || 'Сотрудник'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Создано: {formatDate(invite.created_at)}</p>
                        <p className="text-xs text-gray-500 break-all mt-2">{link}</p>
                      </div>
                      <div className="flex flex-col gap-2 min-w-[96px]">
                        <Button size="sm" onClick={() => handleCopyInvite(token)}>
                          {copiedToken === token ? 'Скопировано' : 'Скопировать'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleDeleteInvite(invite.id)}>
                          Удалить
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="mt-8 pb-4">
          <h2 className="text-lg font-semibold text-gray-dark mb-3">Сотрудники</h2>
          {employees.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm px-4 py-6 text-center text-sm text-gray-500">
              Пока нет сотрудников. Отправьте приглашение, чтобы добавить специалиста в команду.
            </div>
          ) : (
            <div className="space-y-4">
              {employees.map(employee => (
                <div key={employee.user_id} className="bg-white rounded-2xl shadow-md p-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-dark">
                        {(employee.first_name || employee.last_name)
                          ? `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()
                          : 'Без имени'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Роль: {ROLE_LABELS[employee.role || ''] || 'Сотрудник организации'}
                      </p>
                      {employee.phone && (
                        <p className="text-xs text-gray-500 mt-1">Телефон: {employee.phone}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        В организации: {formatDate(employee.created_at)}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => handleRemoveEmployee(employee.user_id)}>
                      Удалить
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

