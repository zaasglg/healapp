import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { ensureEmployeeInviteTokens, upsertEmployeeInviteToken } from '@/utils/inviteStorage'

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
  role?: string | null
  created_at: string
  link: string
}

interface OrganizationInvite extends BaseInvite {
  source: 'supabase'
  token: string
  organization_id: string
  status: 'active' | 'used' | 'expired'
}

interface LocalInvite extends BaseInvite {
  source: 'local'
  token: string
  owner_id: string
  used_at?: string | null
  used_by?: string | null
  type: InviteType
}

type CombinedInvite = OrganizationInvite | LocalInvite

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

export const AdminInvitesPage = () => {
  const [selectedType, setSelectedType] = useState<InviteType>('organization')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)

  const [filterType, setFilterType] = useState<'all' | InviteType>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const organizationInvites = useMemo<OrganizationInvite[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('admin_supabase_invites') || '[]')
      if (!Array.isArray(stored)) return []
      return stored.map((item: any) => {
        const token = item.token
        const link = item.link || buildInviteLink('organization', token)
        return {
          id: item.id || token || crypto.randomUUID(),
          source: 'supabase' as const,
          token,
          organization_id: item.organization_id || '—',
          created_at: item.created_at || item.createdAt || new Date().toISOString(),
          status: item.used_at || item.usedAt ? 'used' : 'active',
          link,
        }
      })
    } catch (error) {
      console.warn('Не удалось загрузить supabase-инвайты из localStorage', error)
      return []
    }
  }, [])

  const localInvites = useMemo<LocalInvite[]>(() => {
    const result: LocalInvite[] = []

    try {
      const tokens = ensureEmployeeInviteTokens()
      result.push(
        ...tokens.map(token => {
          const inviteToken = token.token
          return {
            id: token.id || inviteToken || crypto.randomUUID(),
            source: 'local' as const,
            token: inviteToken,
            owner_id: token.organization_id || '—',
            role: token.role || null,
            created_at: token.created_at || new Date().toISOString(),
            used_at: token.used_at || null,
            used_by: token.used_by || null,
            type: 'employee' as InviteType,
            link: token.link || buildInviteLink('employee', inviteToken),
          }
        })
      )
    } catch (error) {
      console.warn('Не удалось обработать local_invite_tokens', error)
    }

    try {
      const caregiverTokensRaw = localStorage.getItem('caregiver_client_invite_tokens')
      if (caregiverTokensRaw) {
        const tokens = JSON.parse(caregiverTokensRaw)
        if (Array.isArray(tokens)) {
          result.push(
            ...tokens.map((token: any) => {
              const inviteToken = token.token
              return {
                id: token.id || inviteToken || crypto.randomUUID(),
                source: 'local' as const,
                token: inviteToken,
                owner_id: token.caregiver_id || '—',
                created_at: token.created_at || new Date().toISOString(),
                used_at: token.used_at || null,
                used_by: token.used_by || null,
                role: 'caregiver_client',
                type: 'client' as InviteType,
                link: token.link || buildInviteLink('client', inviteToken),
              }
            })
          )
        }
      }
    } catch (error) {
      console.warn('Не удалось обработать caregiver_client_invite_tokens', error)
    }

    try {
      const diaryLinksRaw = localStorage.getItem('diary_client_links')
      if (diaryLinksRaw) {
        const diaryLinks = JSON.parse(diaryLinksRaw)
        if (diaryLinks && typeof diaryLinks === 'object') {
          Object.keys(diaryLinks).forEach(diaryId => {
            const link = diaryLinks[diaryId]
            if (!link) return
            const token = link.token || '—'
            const directLink = link.direct_link || link.link || link.url || link.finalLink
            result.push({
              id: token || diaryId,
              source: 'local' as const,
              token,
              owner_id: link.organization_id || link.caregiver_id || '—',
              created_at: link.created_at || new Date().toISOString(),
              used_at: link.accepted_at || null,
              used_by: link.accepted_by || null,
              role: 'organization_client',
              type: 'client',
              link: directLink || buildInviteLink('client', token),
            })
          })
        }
      }
    } catch (error) {
      console.warn('Не удалось обработать diary_client_links', error)
    }

    try {
      const privateCaregiverTokensRaw = localStorage.getItem('private_caregiver_invite_tokens')
      if (privateCaregiverTokensRaw) {
        const tokens = JSON.parse(privateCaregiverTokensRaw)
        if (Array.isArray(tokens)) {
          result.push(
            ...tokens.map((token: any) => {
              const inviteToken = token.token
              return {
                id: token.id || inviteToken || crypto.randomUUID(),
                source: 'local' as const,
                token: inviteToken,
                owner_id: token.created_by || '—',
                created_at: token.created_at || new Date().toISOString(),
                used_at: token.used_at || null,
                used_by: token.used_by || null,
                role: 'private_caregiver_invite',
                type: 'privateCaregiver' as InviteType,
                link: token.link || buildInviteLink('privateCaregiver', inviteToken),
              }
            })
          )
        }
      }
    } catch (error) {
      console.warn('Не удалось обработать private_caregiver_invite_tokens', error)
    }

    return result
  }, [])

  const combinedInvites = useMemo<CombinedInvite[]>(() => {
    const combined = [...organizationInvites, ...localInvites]
    return combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [organizationInvites, localInvites])

  const filteredInvites = useMemo(() => {
    return combinedInvites.filter(invite => {
      if (filterType !== 'all') {
        const inviteType =
          invite.source === 'supabase'
            ? 'organization'
            : invite.type
        if (inviteType !== filterType) {
          return false
        }
      }

      if (!searchQuery.trim()) {
        return true
      }

      const query = searchQuery.trim().toLowerCase()
      return (
        invite.token.toLowerCase().includes(query) ||
        (invite.source === 'supabase'
          ? invite.organization_id.toLowerCase().includes(query)
          : invite.owner_id.toLowerCase().includes(query)) ||
        (invite.role || '').toLowerCase().includes(query)
      )
    })
  }, [combinedInvites, filterType, searchQuery])

  const stats = useMemo(() => {
    const base = {
      total: combinedInvites.length,
      active: 0,
      used: 0,
      byType: {
        organization: 0,
        employee: 0,
        client: 0,
        privateCaregiver: 0,
      } as Record<InviteType, number>,
    }

    combinedInvites.forEach(invite => {
      const type: InviteType =
        invite.source === 'supabase'
          ? 'organization'
          : invite.type

      base.byType[type] = (base.byType[type] || 0) + 1

      const isActive =
        invite.source === 'supabase'
          ? invite.status !== 'used'
          : !invite.used_at
      if (isActive) {
        base.active += 1
      } else {
        base.used += 1
      }
    })

    return base
  }, [combinedInvites])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setGeneratedLink(null)

    try {
      const token = crypto.randomUUID()
      const link = buildInviteLink(selectedType, token)

      if (selectedType === 'organization') {
        setTimeout(() => {
          const existing = JSON.parse(localStorage.getItem('admin_supabase_invites') || '[]')
          const next = [
            {
              id: token,
              token,
              organization_id: '—',
              created_at: new Date().toISOString(),
              status: 'active',
              link,
            },
            ...existing,
          ]
          localStorage.setItem('admin_supabase_invites', JSON.stringify(next))
        }, 50)
      } else {
        const storageKey =
          selectedType === 'employee'
            ? 'local_invite_tokens'
            : selectedType === 'client'
            ? 'caregiver_client_invite_tokens'
            : 'private_caregiver_invite_tokens'
        const nextRecord: Record<string, any> = {
          id: token,
          token,
          created_at: new Date().toISOString(),
          used_at: null,
          used_by: null,
          link,
        }
        if (selectedType === 'employee') {
          nextRecord.organization_id = '—'
        }
        if (selectedType === 'client') {
          nextRecord.caregiver_id = '—'
        }
        if (selectedType === 'privateCaregiver') {
          nextRecord.created_by = '—'
        }
        if (selectedType === 'employee') {
          upsertEmployeeInviteToken({ ...nextRecord, token: nextRecord.id })
        } else {
          const existing = JSON.parse(localStorage.getItem(storageKey) || '[]')
          const next = [nextRecord, ...existing]
          localStorage.setItem(storageKey, JSON.stringify(next))
        }
      }

      setGeneratedLink(link)
    } catch (error) {
      console.error('Не удалось сгенерировать токен', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value).catch(error => {
      console.warn('Не удалось скопировать текст', error)
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-800">Управление пригласительными ссылками</h2>
      </div>

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
            {inviteTypeOptions.map(option => (
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
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Список приглашений</h3>
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

          <div className="overflow-hidden border border-gray-200 rounded-2xl overflow-x-auto hidden lg:block">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-[#F7FCFD] text-gray-500 uppercase tracking-wide text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Тип</th>
                  <th className="px-4 py-3 text-left">Источник</th>
                  <th className="px-4 py-3 text-left">Ссылка</th>
                  <th className="px-4 py-3 text-left">Владелец</th>
                  <th className="px-4 py-3 text-left">Статус</th>
                  <th className="px-4 py-3 text-left">Создан</th>
                  <th className="px-4 py-3 text-left">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredInvites.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      Ссылки не найдены. После подключения Supabase и API появится полный CRUD.
                    </td>
                  </tr>
                ) : (
                  filteredInvites.map(invite => {
                    const typeLabel =
                      invite.source === 'supabase'
                        ? 'Организация'
                        : invite.type === 'employee'
                        ? 'Сотрудник'
                        : invite.type === 'client'
                        ? 'Клиент'
                        : 'Частная сиделка'

                    const statusLabel =
                      invite.source === 'supabase'
                        ? invite.status === 'used'
                          ? 'Использована'
                          : 'Активна'
                        : invite.used_at
                        ? 'Использована'
                        : 'Активна'

                    const owner =
                      invite.source === 'supabase' ? invite.organization_id : invite.owner_id || '—'

                    return (
                      <tr key={`${invite.source}-${invite.id}`}>
                        <td className="px-4 py-3 text-gray-800">{typeLabel}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-full ${
                              invite.source === 'supabase'
                                ? 'bg-[#55ACBF]/10 text-[#0A6D83]'
                                : 'bg-[#F1F5F9] text-gray-600'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                invite.source === 'supabase' ? 'bg-[#0A6D83]' : 'bg-gray-500'
                              }`}
                            ></span>
                            {invite.source === 'supabase' ? 'Supabase' : 'Local'}
                          </span>
                        </td>
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
                        <td className="px-4 py-3 text-gray-700">{owner}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                              statusLabel === 'Активна'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-200 text-gray-600'
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
                            <Button variant="outline" size="sm" disabled>
                              Отключить
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden space-y-3">
            {filteredInvites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500 text-center">
                Ссылки не найдены. После подключения Supabase и API появится полный CRUD.
              </div>
            ) : (
              filteredInvites.map(invite => {
                const typeLabel =
                  invite.source === 'supabase'
                    ? 'Организация'
                    : invite.type === 'employee'
                    ? 'Сотрудник'
                    : invite.type === 'client'
                    ? 'Клиент'
                    : 'Частная сиделка'

                const statusLabel =
                  invite.source === 'supabase'
                    ? invite.status === 'used'
                      ? 'Использована'
                      : 'Активна'
                    : invite.used_at
                    ? 'Использована'
                    : 'Активна'

                const owner = invite.source === 'supabase' ? invite.organization_id : invite.owner_id || '—'

                return (
                  <div
                    key={`${invite.source}-${invite.id}-card`}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F7FCFD] text-[#0A6D83] border border-[#55ACBF]/40">
                        {typeLabel}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                          statusLabel === 'Активна' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm text-gray-700">
                      <p className="font-semibold text-gray-800 break-all">{owner}</p>
                      <p className="text-xs text-gray-400">
                        Создана: {new Date(invite.created_at).toLocaleString('ru-RU')}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-2 px-2 py-1 rounded-full ${
                            invite.source === 'supabase'
                              ? 'bg-[#55ACBF]/10 text-[#0A6D83]'
                              : 'bg-[#F1F5F9] text-gray-600'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              invite.source === 'supabase' ? 'bg-[#0A6D83]' : 'bg-gray-500'
                            }`}
                          ></span>
                          {invite.source === 'supabase' ? 'Supabase' : 'Local'}
                        </span>
                        <span className="text-xs text-gray-500 break-all">Токен: {invite.token}</span>
                      </div>
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
                      <Button
                        size="sm"
                        onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(invite.link)}`, '_blank')}
                      >
                        Отправить в WhatsApp
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>

      <div className="text-xs text-gray-400 text-right">
        Шаг 12.2 — интерфейс управления приглашениями готов, осталось интегрировать реальные операции (12.3+)
      </div>
    </div>
  )
}



