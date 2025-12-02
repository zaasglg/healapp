import { useMemo, useState, useEffect } from 'react'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { Button } from '@/components/ui'

type InviteType = 'organization' | 'employee' | 'client' | 'privateCaregiver'

const getOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

const buildInviteLink = (type: InviteType, token: string) => {
  const origin = getOrigin()
  switch (type) {
    case 'organization':
      return `${origin}/register?token=${token}`
    case 'privateCaregiver':
      return `${origin}/register?token=${token}`
    case 'employee':
      return `${origin}/register?org_token=${token}`
    case 'client':
    default:
      return `${origin}/client-invite?token=${token}`
  }
}

interface BaseInvite {
  id: string
  token: string
  created_at: string
  link: string
  used_at?: string | null
  used_by?: string | null
  status: 'active' | 'used' | 'expired' | 'revoked'
}

interface OrganizationInvite extends BaseInvite {
  source: 'supabase'
  invite_type: 'organization'
  organization_type?: 'pension' | 'patronage_agency' | null
  invited_email?: string | null
  invited_name?: string | null
}

interface PrivateCaregiverInvite extends BaseInvite {
  source: 'supabase'
  invite_type: 'private_caregiver'
  invited_email?: string | null
  invited_name?: string | null
}

interface EmployeeInvite extends BaseInvite {
  source: 'supabase'
  invite_type: 'organization_employee'
  organization_id?: string | null
  employee_role?: string | null
}

interface ClientInvite extends BaseInvite {
  source: 'supabase'
  invite_type: 'organization_client' | 'caregiver_client'
  organization_id?: string | null
  caregiver_id?: string | null
}

type CombinedInvite = OrganizationInvite | PrivateCaregiverInvite | EmployeeInvite | ClientInvite

const inviteTypeOptions: { value: InviteType; label: string }[] = [
  { value: 'organization', label: 'Организация' },
  { value: 'employee', label: 'Сотрудник организации' },
  { value: 'client', label: 'Клиент' },
  { value: 'privateCaregiver', label: 'Частная сиделка' },
]

const getInviteTypeLabel = (type: InviteType) => {
  switch (type) {
    case 'organization':
      return 'Организация'
    case 'employee':
      return 'Сотрудник'
    case 'privateCaregiver':
      return 'Частная сиделка'
    case 'client':
    default:
      return 'Клиент'
  }
}

const mapInviteTypeToDbType = (
  type: InviteType
): 'organization' | 'private_caregiver' | 'organization_client' | 'caregiver_client' | 'admin_static' => {
  if (type === 'organization') return 'organization'
  if (type === 'privateCaregiver') return 'private_caregiver'
  if (type === 'client') return 'admin_static' // Явный клиент без привязки
  throw new Error(`Неподдерживаемый тип для админской панели: ${type}`)
}

export const AdminInvitesPage = () => {
  const [selectedType, setSelectedType] = useState<InviteType>('organization')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<'all' | InviteType>('all')
  const [invites, setInvites] = useState<CombinedInvite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Загрузка приглашений из Supabase
  // Автоматическое обновление списка приглашений каждые 30 секунд
  useEffect(() => {
    const loadInvites = async () => {
      setIsLoading(true)
      setError(null)

      // Используем admin клиент для обхода RLS
      const client = supabaseAdmin || supabase
      
      if (!supabaseAdmin) {
        setError('Для загрузки приглашений требуется VITE_SUPABASE_SERVICE_ROLE_KEY в .env.local')
        setIsLoading(false)
        return
      }

      try {
        // Загружаем все приглашения
        const { data: inviteTokens, error: inviteError } = await client
          .from('invite_tokens')
          .select(`
            id,
            token,
            invite_type,
            created_at,
            used_at,
            used_by,
            revoked_at,
            expires_at,
            organization_registration_invite_tokens (
              organization_type,
              invited_email,
              invited_name
            ),
            private_caregiver_registration_invite_tokens (
              invited_email,
              invited_name
            ),
            organization_invite_tokens (
              organization_id,
              employee_role
            ),
            organization_client_invite_tokens (
              organization_id
            ),
            caregiver_client_invite_tokens (
              caregiver_id
            )
          `)
          .order('created_at', { ascending: false })

        if (inviteError) {
          console.error('Ошибка загрузки приглашений:', inviteError)
          setError('Не удалось загрузить приглашения')
          return
        }

        if (!inviteTokens) {
          setInvites([])
          return
        }

        // Преобразуем данные в формат CombinedInvite
        const mappedInvites: CombinedInvite[] = inviteTokens.map((invite: any) => {
          // Проверяем статус: сначала revoked, потом used, потом expired, потом active
          const isRevoked = !!invite.revoked_at
          const isUsed = !!invite.used_at
          const isExpired = invite.expires_at ? new Date(invite.expires_at) < new Date() : false
          
          const status = isRevoked
            ? 'revoked'
            : isUsed
            ? 'used'
            : isExpired
            ? 'expired'
            : 'active'

          const link = buildInviteLink(
            invite.invite_type === 'organization'
              ? 'organization'
              : invite.invite_type === 'private_caregiver'
              ? 'privateCaregiver'
              : invite.invite_type === 'organization_employee'
              ? 'employee'
              : 'client',
            invite.token
          )

          if (invite.invite_type === 'organization') {
            const orgData = Array.isArray(invite.organization_registration_invite_tokens)
              ? invite.organization_registration_invite_tokens[0]
              : invite.organization_registration_invite_tokens

            return {
              id: invite.id,
              token: invite.token,
              created_at: invite.created_at,
              link,
              used_at: invite.used_at,
              used_by: invite.used_by,
              status,
              source: 'supabase',
              invite_type: 'organization',
              organization_type: orgData?.organization_type || null,
              invited_email: orgData?.invited_email || null,
              invited_name: orgData?.invited_name || null,
            } as OrganizationInvite
          }

          if (invite.invite_type === 'private_caregiver') {
            const caregiverData = Array.isArray(invite.private_caregiver_registration_invite_tokens)
              ? invite.private_caregiver_registration_invite_tokens[0]
              : invite.private_caregiver_registration_invite_tokens

            return {
              id: invite.id,
              token: invite.token,
              created_at: invite.created_at,
              link,
              used_at: invite.used_at,
              used_by: invite.used_by,
              status,
              source: 'supabase',
              invite_type: 'private_caregiver',
              invited_email: caregiverData?.invited_email || null,
              invited_name: caregiverData?.invited_name || null,
            } as PrivateCaregiverInvite
          }

          if (invite.invite_type === 'organization_employee') {
            const empData = Array.isArray(invite.organization_invite_tokens)
              ? invite.organization_invite_tokens[0]
              : invite.organization_invite_tokens

            return {
              id: invite.id,
              token: invite.token,
              created_at: invite.created_at,
              link,
              used_at: invite.used_at,
              used_by: invite.used_by,
              status,
              source: 'supabase',
              invite_type: 'organization_employee',
              organization_id: empData?.organization_id || null,
              employee_role: empData?.employee_role || null,
            } as EmployeeInvite
          }

          // organization_client или caregiver_client
          const clientData =
            invite.organization_client_invite_tokens ||
            invite.caregiver_client_invite_tokens ||
            {}

          return {
            id: invite.id,
            token: invite.token,
            created_at: invite.created_at,
            link,
            used_at: invite.used_at,
            used_by: invite.used_by,
            status,
            source: 'supabase',
            invite_type: invite.invite_type as 'organization_client' | 'caregiver_client',
            organization_id: clientData.organization_id || null,
            caregiver_id: clientData.caregiver_id || null,
          } as ClientInvite
        })

        setInvites(mappedInvites)
      } catch (err) {
        console.error('Ошибка при загрузке приглашений:', err)
        setError('Произошла ошибка при загрузке данных')
      } finally {
        setIsLoading(false)
      }
    }

    loadInvites()
    
    // Автоматическое обновление каждые 30 секунд
    const interval = setInterval(() => {
      loadInvites()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  const filteredInvites = useMemo(() => {
    return invites.filter(invite => {
      if (filterType === 'all') return true

      const inviteType =
        invite.invite_type === 'organization'
          ? 'organization'
          : invite.invite_type === 'private_caregiver'
          ? 'privateCaregiver'
          : invite.invite_type === 'organization_employee'
          ? 'employee'
          : 'client'

      return inviteType === filterType
    })
  }, [invites, filterType])

  const stats = useMemo(() => {
    const base = {
      total: invites.length,
      active: 0,
      used: 0,
      byType: {
        organization: 0,
        employee: 0,
        client: 0,
        privateCaregiver: 0,
      } as Record<InviteType, number>,
    }

    invites.forEach(invite => {
      const type: InviteType =
        invite.invite_type === 'organization'
          ? 'organization'
          : invite.invite_type === 'private_caregiver'
          ? 'privateCaregiver'
          : invite.invite_type === 'organization_employee'
          ? 'employee'
          : 'client'

      base.byType[type] = (base.byType[type] || 0) + 1

      if (invite.status === 'active') {
        base.active += 1
      } else if (invite.status === 'used') {
        base.used += 1
      }
    })

    return base
  }, [invites])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setGeneratedLink(null)
    setError(null)

    try {
      const dbType = mapInviteTypeToDbType(selectedType)
      const payload: any = {
        expires_in_hours: 168, // 7 дней
      }

      if (selectedType === 'organization') {
        // Для организаций нужно указать тип (pension или patronage_agency)
        // Пока используем pension по умолчанию, можно добавить выбор в UI
        payload.organization_type = 'pension'
      } else if (selectedType === 'client') {
        // Для клиентов можно указать опциональные данные
        // organization_id и patient_card_id не обязательны для админских приглашений
        payload.organization_id = null
        payload.patient_card_id = null
        payload.diary_id = null
      }

      // Проверяем админский токен локально
      const adminToken = localStorage.getItem('admin_panel_token')
      if (!adminToken) {
        setError('Не найден админский токен. Обновите страницу с токеном в URL.')
        return
      }

      // Проверяем токен локально (как делает Edge Function)
      const allowedTokensEnv = import.meta.env.VITE_ADMIN_TOKENS || ''
      const allowedTokens = allowedTokensEnv.split(',').map((t: string) => t.trim()).filter(Boolean)
      const fallbackToken = 'b8f56f5c-62f1-45d9-9e5a-e8bbfdadcf0f'
      
      if (!allowedTokens.includes(adminToken) && adminToken !== fallbackToken) {
        setError('Недействительный админский токен')
        return
      }

      // Используем admin клиент для обхода RLS (требуется VITE_SUPABASE_SERVICE_ROLE_KEY)
      const client = supabaseAdmin || supabase
      
      if (!supabaseAdmin) {
        setError('Для создания приглашений требуется VITE_SUPABASE_SERVICE_ROLE_KEY в .env.local')
        return
      }

      // Вызываем RPC напрямую через Supabase клиент (без Edge Function)
      const { data: rpcData, error: rpcError } = await client.rpc('generate_admin_invite_link', {
        invite_type: dbType,
        payload: payload,
      })

      if (rpcError) {
        console.error('Ошибка создания приглашения:', rpcError)
        setError(rpcError.message || 'Не удалось создать приглашение')
        return
      }

      if (!rpcData) {
        setError('Не удалось создать приглашение')
        return
      }

      const result = { success: true, invite: rpcData }
      const link = buildInviteLink(selectedType, result.invite.token)
      setGeneratedLink(link)

      // Перезагружаем список приглашений
      const { data: inviteTokens } = await client
        .from('invite_tokens')
        .select('*')
        .eq('id', result.invite.id)
        .single()

      if (inviteTokens) {
        // Обновляем список приглашений
        // Определяем статус правильно
        const isUsed = !!result.invite.used_at
        const isExpired = result.invite.expires_at ? new Date(result.invite.expires_at) < new Date() : false
        const status = isUsed ? 'used' : isExpired ? 'expired' : 'active'
        
        const newInvite: CombinedInvite = {
          id: result.invite.id,
          token: result.invite.token,
          created_at: result.invite.created_at,
          link,
          used_at: result.invite.used_at,
          used_by: result.invite.used_by,
          status,
          source: 'supabase',
          invite_type: dbType,
          ...(selectedType === 'organization'
            ? { organization_type: 'pension' as const }
            : selectedType === 'privateCaregiver'
            ? { invited_email: null, invited_name: null }
            : {}),
        } as CombinedInvite

        setInvites(prev => [newInvite, ...prev])
      }
    } catch (err) {
      console.error('Ошибка при создании приглашения:', err)
      setError('Произошла ошибка при создании приглашения')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value).catch(error => {
      console.warn('Не удалось скопировать текст', error)
    })
  }

  const handleRevoke = async (inviteId: string) => {
    try {
      setError(null)
      const adminToken = localStorage.getItem('admin_panel_token')
      if (!adminToken) {
        setError('Не найден админский токен. Обновите страницу с токеном в URL.')
        return
      }
      
      // Проверяем токен локально
      const allowedTokensEnv = import.meta.env.VITE_ADMIN_TOKENS || ''
      const allowedTokens = allowedTokensEnv.split(',').map((t: string) => t.trim()).filter(Boolean)
      const fallbackToken = 'b8f56f5c-62f1-45d9-9e5a-e8bbfdadcf0f'
      
      if (!allowedTokens.includes(adminToken) && adminToken !== fallbackToken) {
        setError('Недостаточно прав для отзыва приглашения')
        return
      }

      // Используем admin клиент для обхода RLS
      if (!supabaseAdmin) {
        setError('Для отзыва приглашений требуется VITE_SUPABASE_SERVICE_ROLE_KEY в .env.local')
        return
      }

      // Удаляем приглашение напрямую через Supabase клиент
      const { error: deleteError } = await supabaseAdmin
        .from('invite_tokens')
        .delete()
        .eq('id', inviteId)

      if (deleteError) {
        console.error('Ошибка отзыва приглашения:', deleteError)
        setError(deleteError.message || 'Не удалось отозвать приглашение')
        return
      }

      // Удаляем приглашение из списка (оно удалено из БД каскадно)
      setInvites(prev => prev.filter(invite => invite.id !== inviteId))
    } catch (err) {
      console.error('Ошибка при отзыве приглашения:', err)
      setError('Произошла ошибка при отзыве приглашения')
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-800">Управление пригласительными ссылками</h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-6 shadow-sm">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Всего ссылок</p>
            <p className="text-2xl font-semibold text-gray-800">{stats.total}</p>
          </div>
          <div className="rounded-3xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Активные</p>
            <p className="text-2xl font-semibold text-green-700">{stats.active}</p>
          </div>
          <div className="rounded-3xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Использованные</p>
            <p className="text-2xl font-semibold text-gray-800">{stats.used}</p>
          </div>
          <div className="rounded-3xl border border-gray-200 p-5 shadow-sm space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide">По типам</p>
            <div className="space-y-1 text-sm text-gray-600">
              {(Object.keys(stats.byType) as InviteType[]).map(type => (
                <div key={type} className="flex justify-between">
                  <span>{getInviteTypeLabel(type)}</span>
                  <span className="font-medium text-gray-800">{stats.byType[type]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Создать приглашение</h3>
          </div>

          <div className="flex flex-wrap gap-3">
            {inviteTypeOptions
              .filter(
                option =>
                  option.value === 'organization' ||
                  option.value === 'privateCaregiver' ||
                  option.value === 'client'
              )
              .map(option => (
                <button
                  key={option.value}
                  onClick={() => setSelectedType(option.value)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                    selectedType === option.value
                      ? 'bg-[#55ACBF]/10 text-[#0A6D83] border-[#55ACBF]'
                      : 'text-gray-600 border-gray-200 hover:border-[#55ACBF]/50 hover:text-[#0A6D83]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
            <Button onClick={handleGenerate} isLoading={isGenerating} className="sm:w-auto w-full">
              Сгенерировать ссылку
            </Button>
            {generatedLink && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#F7FCFD] border border-[#55ACBF]/30 rounded-2xl px-4 py-3 text-sm w-full">
                <span className="font-mono text-gray-700 break-all sm:max-w-md">{generatedLink}</span>
                <Button variant="outline" size="sm" onClick={() => handleCopy(generatedLink)}>
                  Скопировать
                </Button>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Список приглашений</h3>
                {isLoading && <p className="text-sm text-gray-500 mt-1">Загрузка...</p>}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setIsLoading(true)
                  setError(null)
                  try {
                    const { data: inviteTokens, error: inviteError } = await supabase
                      .from('invite_tokens')
                      .select(`
                        *,
                        organization_registration_invite_tokens (
                          organization_type,
                          invited_email,
                          invited_name
                        ),
                        private_caregiver_registration_invite_tokens (
                          invited_email,
                          invited_name
                        ),
                        organization_invite_tokens (
                          organization_id,
                          employee_role
                        ),
                        organization_client_invite_tokens (
                          organization_id
                        ),
                        caregiver_client_invite_tokens (
                          caregiver_id
                        )
                      `)
                      .order('created_at', { ascending: false })

                    if (inviteError) {
                      console.error('Ошибка загрузки приглашений:', inviteError)
                      setError('Не удалось загрузить приглашения')
                      return
                    }

                    if (!inviteTokens) {
                      setInvites([])
                      return
                    }

                    const mappedInvites: CombinedInvite[] = inviteTokens.map((invite: any) => {
                      const isRevoked = !!invite.revoked_at
                      const isUsed = !!invite.used_at
                      const isExpired = invite.expires_at ? new Date(invite.expires_at) < new Date() : false
                      
                      const status = isRevoked
                        ? 'revoked'
                        : isUsed
                        ? 'used'
                        : isExpired
                        ? 'expired'
                        : 'active'

                      const link = buildInviteLink(
                        invite.invite_type === 'organization'
                          ? 'organization'
                          : invite.invite_type === 'private_caregiver'
                          ? 'privateCaregiver'
                          : invite.invite_type === 'organization_employee'
                          ? 'employee'
                          : 'client',
                        invite.token
                      )

                      if (invite.invite_type === 'organization') {
                        const orgData = Array.isArray(invite.organization_registration_invite_tokens)
                          ? invite.organization_registration_invite_tokens[0]
                          : invite.organization_registration_invite_tokens

                        return {
                          id: invite.id,
                          token: invite.token,
                          created_at: invite.created_at,
                          link,
                          used_at: invite.used_at,
                          used_by: invite.used_by,
                          status,
                          source: 'supabase',
                          invite_type: 'organization',
                          organization_type: orgData?.organization_type || null,
                          invited_email: orgData?.invited_email || null,
                          invited_name: orgData?.invited_name || null,
                        } as OrganizationInvite
                      }

                      if (invite.invite_type === 'private_caregiver') {
                        const caregiverData = Array.isArray(invite.private_caregiver_registration_invite_tokens)
                          ? invite.private_caregiver_registration_invite_tokens[0]
                          : invite.private_caregiver_registration_invite_tokens

                        return {
                          id: invite.id,
                          token: invite.token,
                          created_at: invite.created_at,
                          link,
                          used_at: invite.used_at,
                          used_by: invite.used_by,
                          status,
                          source: 'supabase',
                          invite_type: 'private_caregiver',
                          invited_email: caregiverData?.invited_email || null,
                          invited_name: caregiverData?.invited_name || null,
                        } as PrivateCaregiverInvite
                      }

                      if (invite.invite_type === 'organization_employee') {
                        const empData = Array.isArray(invite.organization_invite_tokens)
                          ? invite.organization_invite_tokens[0]
                          : invite.organization_invite_tokens

                        return {
                          id: invite.id,
                          token: invite.token,
                          created_at: invite.created_at,
                          link,
                          used_at: invite.used_at,
                          used_by: invite.used_by,
                          status,
                          source: 'supabase',
                          invite_type: 'organization_employee',
                          organization_id: empData?.organization_id || null,
                          employee_role: empData?.employee_role || null,
                        } as EmployeeInvite
                      }

                      // Клиентские приглашения
                      const _clientData = Array.isArray(invite.organization_client_invite_tokens)
                        ? invite.organization_client_invite_tokens[0]
                        : invite.organization_client_invite_tokens ||
                          (Array.isArray(invite.caregiver_client_invite_tokens)
                            ? invite.caregiver_client_invite_tokens[0]
                            : invite.caregiver_client_invite_tokens)
                      void _clientData // Prevent unused variable warning

                      return {
                        id: invite.id,
                        token: invite.token,
                        created_at: invite.created_at,
                        link,
                        used_at: invite.used_at,
                        used_by: invite.used_by,
                        status,
                        source: 'supabase',
                        invite_type: invite.invite_type === 'organization_client' ? 'organization_client' : 'caregiver_client',
                      } as ClientInvite
                    })

                    setInvites(mappedInvites)
                  } catch (err) {
                    console.error('Ошибка при загрузке приглашений:', err)
                    setError('Произошла ошибка при загрузке приглашений')
                  } finally {
                    setIsLoading(false)
                  }
                }}
              >
                Обновить
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              {(['all', ...inviteTypeOptions.map(option => option.value)] as const).map(option => (
                <button
                  key={option}
                  onClick={() => setFilterType(option)}
                  className={`px-3 py-1 rounded-full border transition-colors whitespace-normal text-left leading-tight max-w-[140px] ${
                    filterType === option
                      ? 'bg-[#55ACBF]/10 text-[#0A6D83] border-[#55ACBF]'
                      : 'border-gray-200 text-gray-500 hover:text-[#0A6D83] hover:border-[#55ACBF]/40'
                  }`}
                >
                  {option === 'all'
                    ? 'Все'
                    : inviteTypeOptions.find(item => item.value === option)?.label || option}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-gray-500">Загрузка приглашений...</div>
          ) : filteredInvites.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500 text-center">
              Приглашения не найдены
            </div>
          ) : (
            <>
              <div className="overflow-hidden border border-gray-200 rounded-2xl overflow-x-auto hidden lg:block">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-[#F7FCFD] text-gray-500 uppercase tracking-wide text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Тип</th>
                      <th className="px-4 py-3 text-left">Ссылка</th>
                      <th className="px-4 py-3 text-left">Статус</th>
                      <th className="px-4 py-3 text-left">Создан</th>
                      <th className="px-4 py-3 text-left">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredInvites.map(invite => {
                      const typeLabel =
                        invite.invite_type === 'organization'
                          ? 'Организация'
                          : invite.invite_type === 'private_caregiver'
                          ? 'Частная сиделка'
                          : invite.invite_type === 'organization_employee'
                          ? 'Сотрудник'
                          : 'Клиент'

                      const statusLabel =
                        invite.status === 'active'
                          ? 'Активна'
                          : invite.status === 'used'
                          ? 'Использована'
                          : invite.status === 'revoked'
                          ? 'Отозвана'
                          : 'Истекла'

                      return (
                        <tr key={invite.id}>
                          <td className="px-4 py-3 text-gray-800">{typeLabel}</td>
                          <td className="px-4 py-3 text-gray-700">
                            <a
                              href={invite.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#0A6D83] underline hover:text-[#55ACBF] break-all"
                            >
                              {invite.link}
                            </a>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                invite.status === 'active'
                                  ? 'bg-green-100 text-green-700'
                                  : invite.status === 'used'
                                  ? 'bg-gray-200 text-gray-600'
                                  : invite.status === 'revoked'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {new Date(invite.created_at).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleCopy(invite.link)}>
                                Скопировать
                              </Button>
                              {invite.status === 'active' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRevoke(invite.id)}
                                  className="text-red-600 border-red-300 hover:bg-red-50"
                                >
                                  Отозвать
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="lg:hidden space-y-3">
                {filteredInvites.map(invite => {
                  const typeLabel =
                    invite.invite_type === 'organization'
                      ? 'Организация'
                      : invite.invite_type === 'private_caregiver'
                      ? 'Частная сиделка'
                      : invite.invite_type === 'organization_employee'
                      ? 'Сотрудник'
                      : 'Клиент'

                  const statusLabel =
                    invite.status === 'active'
                      ? 'Активна'
                      : invite.status === 'used'
                      ? 'Использована'
                      : invite.status === 'revoked'
                      ? 'Отозвана'
                      : 'Истекла'

                  return (
                    <div
                      key={invite.id}
                      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F7FCFD] text-[#0A6D83] border border-[#55ACBF]/40">
                          {typeLabel}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                            invite.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : invite.status === 'used'
                              ? 'bg-gray-100 text-gray-500'
                              : invite.status === 'revoked'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm text-gray-700">
                        <p className="text-xs text-gray-400">
                          Создана: {new Date(invite.created_at).toLocaleString('ru-RU')}
                        </p>
                        <a
                          href={invite.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#0A6D83] underline hover:text-[#55ACBF] break-all text-sm"
                        >
                          {invite.link}
                        </a>
                      </div>
                      <div className="flex flex-col gap-2 text-sm">
                        <Button variant="outline" size="sm" onClick={() => handleCopy(invite.link)}>
                          Скопировать ссылку
                        </Button>
                        {invite.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRevoke(invite.id)}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            Отозвать
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
