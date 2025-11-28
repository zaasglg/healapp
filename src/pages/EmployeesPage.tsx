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

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: 'Создание дневников и карточек подопечных, изменение и заполнение дневников',
  manager: 'Создание дневников и карточек, редактирование, раздача доступа клиентам, управление доступом сотрудников, заполнение дневников',
  caregiver: 'Просмотр и заполнение назначенных дневников',
  doctor: 'Просмотр и заполнение назначенных дневников',
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

  const [organizationId, setOrganizationId] = useState<string | null>(null)
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
        console.log('[EmployeesPage] loadInvites: orgId is null, clearing invites')
        setInvites([])
        return
      }

      console.log('[EmployeesPage] loadInvites: Loading invites for orgId:', orgId)

      try {
        // Загружаем приглашения с фильтрацией по organization_id
        // Используем фильтрацию через вложенный select
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
          console.error('[EmployeesPage] Ошибка загрузки приглашений:', error)
          setInvites([])
          return
        }

        console.log('[EmployeesPage] Загружено приглашений (до фильтрации):', data?.length || 0, data)

        // Фильтруем приглашения по organization_id на клиенте
        // (PostgREST не поддерживает прямую фильтрацию по связанной таблице)
        const mappedInvites = (data || [])
          .map((invite: any) => {
            // organization_invite_tokens может быть массивом или объектом
            const orgInviteData = Array.isArray(invite.organization_invite_tokens)
              ? invite.organization_invite_tokens[0]
              : invite.organization_invite_tokens

            return {
              id: invite.id,
              token: invite.token,
              invite_type: invite.invite_type,
              created_at: invite.created_at,
              expires_at: invite.expires_at,
              used_at: invite.used_at,
              revoked_at: invite.revoked_at,
              organization_invite_tokens: orgInviteData,
            }
          })
          .filter((invite: any) => {
            const inviteOrgId = invite.organization_invite_tokens?.organization_id
            const matches = inviteOrgId === orgId
            if (!matches) {
              console.log('[EmployeesPage] Приглашение отфильтровано:', {
                inviteId: invite.id,
                inviteOrgId,
                expectedOrgId: orgId,
              })
            }
            return matches
          })

        console.log('[EmployeesPage] Отфильтровано приглашений:', mappedInvites.length)

        // Разделяем на активные и использованные
        const activeInvites = mappedInvites.filter((invite: InviteToken) => !invite.used_at)
        const usedInvites = mappedInvites.filter((invite: InviteToken) => invite.used_at)

        console.log('[EmployeesPage] Активных приглашений:', activeInvites.length)
        console.log('[EmployeesPage] Использованных приглашений:', usedInvites.length)

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
        console.error('[EmployeesPage] Не удалось загрузить приглашения:', loadError)
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

    // Разрешаем доступ для организаций и руководителей/администраторов
    if (!isOrganization(orgType)) {
      if (userRole === 'org_employee') {
        // Проверяем, является ли сотрудник руководителем или администратором
        const checkEmployeeRole = async () => {
          try {
            const { data: employeeData, error: employeeError } = await supabase
              .from('organization_employees')
              .select('role, organization_id')
              .eq('user_id', user.id)
              .maybeSingle()
            
            if (!employeeError && employeeData && (employeeData.role === 'manager' || employeeData.role === 'admin')) {
              // Руководитель или администратор - разрешаем доступ
              console.log('[EmployeesPage] Manager/Admin access granted:', employeeData.role)
            } else {
              navigate('/dashboard')
              setIsLoading(false)
            }
          } catch (error) {
            console.error('[EmployeesPage] Error checking employee role:', error)
            navigate('/dashboard')
            setIsLoading(false)
          }
        }
        
        checkEmployeeRole()
        return
      } else {
        setError('Эта страница доступна только организациям и руководителям.')
        setIsLoading(false)
        return
      }
    }

    // Загружаем или создаем запись организации и получаем ее id
    const ensureOrganizationExists = async (): Promise<string | null> => {
      // Для руководителей получаем organization_id из organization_employees
      if (userRole === 'org_employee') {
        try {
          const { data: employeeData, error: employeeError } = await supabase
            .from('organization_employees')
            .select('organization_id')
            .eq('user_id', user.id)
            .maybeSingle()
          
          if (!employeeError && employeeData?.organization_id) {
            console.log('[EmployeesPage] Loaded organization_id from organization_employees:', employeeData.organization_id)
            return employeeData.organization_id
          }
        } catch (error) {
          console.error('[EmployeesPage] Error loading organization_id from organization_employees:', error)
        }
        return null
      }
      
      if (!orgType) return null
      
      try {
        // Проверяем, есть ли запись в organizations
        const { data: existingOrg, error: checkError } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', user.id)
          .single()
        
        if (checkError && checkError.code === 'PGRST116') {
          // Записи нет, создаем ее через RPC
          const { data: createdOrg, error: rpcError } = await supabase.rpc('create_organization', {
            p_organization_type: orgType,
            p_name: user.user_metadata?.name || user.email || 'Организация',
            p_phone: user.user_metadata?.phone || user.email || '',
            p_address: user.user_metadata?.address || null,
          })
          
          if (rpcError) {
            console.error('Ошибка создания записи организации через RPC:', rpcError)
            setError('Не удалось создать запись организации. Обратитесь в поддержку.')
            return null
          } else {
            console.log('✅ Организация создана через RPC:', createdOrg)
            return createdOrg?.id || null
          }
        } else if (checkError) {
          console.error('Ошибка проверки организации:', checkError)
          return null
        } else if (existingOrg?.id) {
          console.log('✅ Организация найдена в БД:', existingOrg.id)
          return existingOrg.id
        }
      } catch (ensureError) {
        console.error('Ошибка при проверке организации:', ensureError)
        return null
      }
      return null
    }
    
    // Загружаем данные из Supabase
    ensureOrganizationExists().then((orgId) => {
      if (!orgId) {
        console.warn('[EmployeesPage] Не удалось получить organization_id')
        setIsLoading(false)
        return
      }
      
      console.log('[EmployeesPage] Используем organization_id:', orgId)
      
      const canonicalOrganizationId = normalizeId(orgId)
      const metadataOrganizationId =
        normalizeId((user as any).organization_id) ||
        normalizeId(user.user_metadata?.organization_id)
      
      const derivedOrganizationId = canonicalOrganizationId || metadataOrganizationId
      
      setOrganizationId(derivedOrganizationId)
      
      // Загружаем сотрудников и приглашения
      const loadData = async () => {
        console.log('[EmployeesPage] Загрузка данных для organization_id:', derivedOrganizationId)
        try {
          await Promise.all([
            loadEmployees(derivedOrganizationId),
            loadInvites(derivedOrganizationId),
          ])
        } catch (error) {
          console.error('[EmployeesPage] Ошибка при загрузке данных:', error)
        } finally {
          setIsLoading(false)
        }
      }
      
      // Первоначальная загрузка
      loadData()
      
      // Автоматическое обновление каждые 3 секунды (для быстрого отображения после регистрации)
      const intervalId = setInterval(() => {
        console.log('[EmployeesPage] Автоматическое обновление списка сотрудников и приглашений')
        loadData()
      }, 3000)
      
      // Очистка интервала при размонтировании
      return () => {
        clearInterval(intervalId)
      }
    }).catch((err) => {
      console.error('[EmployeesPage] Ошибка при загрузке организации:', err)
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
          {organizationId && (
            <button
              onClick={() => {
                setIsLoading(true)
                Promise.all([
                  loadEmployees(organizationId),
                  loadInvites(organizationId),
                ]).finally(() => setIsLoading(false))
              }}
              className="ml-auto p-2"
              aria-label="Обновить"
              title="Обновить список"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
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
              Роль: {ROLE_LABELS[activationNotice.role || ''] || 'Сотрудник'}, время: {activationNotice.used_at ? formatDate(activationNotice.used_at) : 'Неизвестно'}
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
            {selectedRole && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <p className="text-xs font-semibold text-gray-700 mb-1">
                  {ROLE_LABELS[selectedRole] ? `Права ${ROLE_LABELS[selectedRole].toLowerCase()}:` : 'Права доступа:'}
                </p>
                <p className="text-xs text-gray-600">
                  {ROLE_DESCRIPTIONS[selectedRole] || 'Права не определены'}
                </p>
              </div>
            )}
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

