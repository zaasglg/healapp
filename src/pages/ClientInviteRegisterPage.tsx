import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { useAuthStore } from '@/store/authStore'
import {
  normalizeClientLink,
  attachClientToDiary,
  type DiaryClientLink,
} from '@/utils/diaryClientLink'

interface DiaryRecord {
  id: string
  owner_id: string
  client_id: string
  patient_card_id: string
  organization_id: string | null
  caregiver_id: string | null
  created_at: string
}

const clientRegisterSchema = z
  .object({
    firstName: z.string().min(1, 'Введите имя'),
    lastName: z.string().min(1, 'Введите фамилию'),
    phone: z.string().min(10, 'Введите телефон'),
    password: z.string().min(6, 'Пароль должен быть не менее 6 символов'),
    confirmPassword: z.string().min(1, 'Подтвердите пароль'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })

type ClientRegisterFormData = z.infer<typeof clientRegisterSchema>

const formatPhone = (raw: string) => {
  let value = raw.trim().replace(/\s+/g, '')
  if (!value) return ''
  value = value.replace(/[^\d+]/g, '')
  if (value.startsWith('+')) {
    return value
  }
  if (value.startsWith('8')) {
    return `+7${value.slice(1)}`
  }
  if (value.startsWith('7')) {
    return `+${value}`
  }
  if (!value.startsWith('7')) {
    return `+7${value}`
  }
  return value
}

const createClientId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

interface ValidationResult {
  link: DiaryClientLink
  diary: DiaryRecord
}

const validateInvite = (
  diaryId: string,
  token: string,
  originDiary?: DiaryRecord
): ValidationResult | null => {
  try {
    const storedLinksRaw = localStorage.getItem('diary_client_links')
    const storedLinks = storedLinksRaw ? JSON.parse(storedLinksRaw) : {}
    const entryRaw = storedLinks?.[diaryId]
    const normalized = normalizeClientLink(entryRaw, {
      diaryId,
      patientCardId: originDiary?.patient_card_id ?? null,
      organizationId: originDiary?.organization_id ?? null,
    })
    if (!normalized || normalized.token !== token) {
      return null
    }
    const diariesRaw = localStorage.getItem('diaries')
    const diaries: DiaryRecord[] = diariesRaw ? JSON.parse(diariesRaw) : []
    const diary =
      originDiary ||
      diaries.find(record => String(record.id) === String(diaryId)) ||
      null
    if (!diary) {
      return null
    }
    return { link: normalized, diary }
  } catch (error) {
    console.warn('Ошибка проверки ссылки клиента', error)
    return null
  }
}

export const ClientInviteRegisterPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setUser } = useAuthStore()
  const diaryId = searchParams.get('diary') || ''
  const token = searchParams.get('token') || ''
  const flowType: 'organization' | 'caregiver' = diaryId ? 'organization' : 'caregiver'

  const [status, setStatus] = useState<'loading' | 'invalid' | 'form' | 'processing'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [linkInfo, setLinkInfo] = useState<DiaryClientLink | null>(null)
  const [diaryInfo, setDiaryInfo] = useState<DiaryRecord | null>(null)
  const [caregiverInvite, setCaregiverInvite] = useState<any | null>(null)
  const [caregiverUser, setCaregiverUser] = useState<any | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientRegisterFormData>({
    resolver: zodResolver(clientRegisterSchema),
  })

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      setError('Ссылка недействительна. Проверьте корректность приглашения.')
      return
    }

    if (flowType === 'caregiver') {
      try {
        const tokensRaw = localStorage.getItem('caregiver_client_invite_tokens')
        const tokens = tokensRaw ? JSON.parse(tokensRaw) : []
        const invite = tokens.find((item: any) => String(item.token) === String(token))

        if (!invite) {
          setStatus('invalid')
          setError('Пригласительная ссылка недействительна или была удалена.')
          return
        }

        if (invite.used_at) {
          setStatus('invalid')
          setError('Эта пригласительная ссылка уже была использована.')
          return
        }

        setCaregiverInvite(invite)

        try {
          const usersRaw = localStorage.getItem('local_users')
          const users = usersRaw ? JSON.parse(usersRaw) : []
          const caregiver = users.find((u: any) => String(u.id) === String(invite.caregiver_id))
          if (caregiver) {
            setCaregiverUser(caregiver)
          }
        } catch (userError) {
          console.log('Не удалось загрузить данные сиделки', userError)
        }

        setStatus('form')
      } catch (err) {
        console.error('Ошибка проверки пригласительной ссылки сиделки', err)
        setStatus('invalid')
        setError('Не удалось проверить приглашение. Попробуйте позже.')
      }
      return
    }

    if (!diaryId) {
      setStatus('invalid')
      setError('Ссылка недействительна. Не указан дневник для доступа.')
      return
    }

    const diariesRaw = localStorage.getItem('diaries')
    const diaries: DiaryRecord[] = diariesRaw ? JSON.parse(diariesRaw) : []
    const diary = diaries.find(record => String(record.id) === String(diaryId)) || null
    if (!diary) {
      setStatus('invalid')
      setError('Дневник не найден или доступ к нему был отозван.')
      return
    }

    const validation = validateInvite(diaryId, token, diary)
    if (!validation) {
      setStatus('invalid')
      setError('Приглашение недействительно или уже было использовано.')
      return
    }

    setLinkInfo(validation.link)
    setDiaryInfo(validation.diary)

    if (validation.link.accepted_by) {
      setStatus('invalid')
      setError('Эта ссылка уже была использована другим пользователем.')
      return
    }

    setStatus('form')
  }, [flowType, diaryId, token])

  const handleOrganizationSubmit = (formData: ClientRegisterFormData) => {
    if (!diaryId || !token || !linkInfo || !diaryInfo) return
    setStatus('processing')
    setError(null)

    const phone = formatPhone(formData.phone)
    if (!phone) {
      setError('Введите корректный номер телефона')
      setStatus('form')
      return
    }

    try {
      const usersRaw = localStorage.getItem('local_users')
      const users = usersRaw ? JSON.parse(usersRaw) : []
      if (users.some((user: any) => user.phone === phone)) {
        setError('Пользователь с таким номером телефона уже зарегистрирован')
        setStatus('form')
        return
      }

      const clientId = createClientId()
      const now = new Date().toISOString()

      const newUser = {
        id: clientId,
        phone,
        password: formData.password,
        user_role: 'client',
        organization_id: diaryInfo.organization_id,
        caregiver_id: null,
        created_at: now,
      }

      const nextUsers = [...users, newUser]
      localStorage.setItem('local_users', JSON.stringify(nextUsers))

      const clientsRaw = localStorage.getItem('local_clients')
      const clients = clientsRaw ? JSON.parse(clientsRaw) : []
      const clientProfile = {
        user_id: clientId,
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone,
        diary_id: diaryInfo.id,
        patient_card_id: diaryInfo.patient_card_id,
        organization_id: diaryInfo.organization_id,
        caregiver_id: diaryInfo.caregiver_id ?? null,
        created_at: now,
        updated_at: now,
      }
      const nextClients = [...clients, clientProfile]
      localStorage.setItem('local_clients', JSON.stringify(nextClients))

      const { diary: updatedDiary } = attachClientToDiary({
        diaryId,
        clientId,
      })

      const storedLinksRaw = localStorage.getItem('diary_client_links')
      const storedLinks = storedLinksRaw ? JSON.parse(storedLinksRaw) : {}
      const normalizedLink = normalizeClientLink(storedLinks?.[diaryId], {
        diaryId,
        patientCardId: updatedDiary?.patient_card_id ?? diaryInfo.patient_card_id ?? null,
        organizationId: updatedDiary?.organization_id ?? diaryInfo.organization_id ?? null,
      })

      if (normalizedLink) {
        normalizedLink.accepted_by = clientId
        normalizedLink.accepted_at = now
        normalizedLink.patient_card_id =
          normalizedLink.patient_card_id ?? updatedDiary?.patient_card_id ?? diaryInfo.patient_card_id ?? null
        normalizedLink.organization_id =
          normalizedLink.organization_id ?? updatedDiary?.organization_id ?? diaryInfo.organization_id ?? null
        storedLinks[diaryId] = normalizedLink
        localStorage.setItem('diary_client_links', JSON.stringify(storedLinks))
      }

      const currentUser = {
        id: clientId,
        user_role: 'client',
        phone,
        organization_id: updatedDiary?.organization_id ?? diaryInfo.organization_id ?? null,
        caregiver_id: updatedDiary?.caregiver_id ?? diaryInfo.caregiver_id ?? null,
        diary_id: diaryId,
        patient_card_id: updatedDiary?.patient_card_id ?? diaryInfo.patient_card_id ?? null,
        profile_data: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone,
        },
      }

      localStorage.setItem('current_user', JSON.stringify(currentUser))
      localStorage.setItem('auth_token', `client_token_${clientId}`)
      setUser(currentUser as any)

      setStatus('processing')
      navigate('/profile')
    } catch (err) {
      console.error('Ошибка регистрации клиента', err)
      setError('Не удалось завершить регистрацию. Попробуйте ещё раз.')
      setStatus('form')
    }
  }

  const handleCaregiverSubmit = (formData: ClientRegisterFormData) => {
    if (!caregiverInvite) return
    setStatus('processing')
    setError(null)

    const phone = formatPhone(formData.phone)
    if (!phone) {
      setError('Введите корректный номер телефона')
      setStatus('form')
      return
    }

    try {
      const usersRaw = localStorage.getItem('local_users')
      const users = usersRaw ? JSON.parse(usersRaw) : []
      if (users.some((user: any) => user.phone === phone)) {
        setError('Пользователь с таким номером телефона уже зарегистрирован')
        setStatus('form')
        return
      }

      const clientId = createClientId()
      const now = new Date().toISOString()

      const newUser = {
        id: clientId,
        phone,
        password: formData.password,
        user_role: 'client',
        organization_id: null,
        caregiver_id: caregiverInvite.caregiver_id ?? null,
        created_at: now,
      }

      const nextUsers = [...users, newUser]
      localStorage.setItem('local_users', JSON.stringify(nextUsers))

      const clientsRaw = localStorage.getItem('local_clients')
      const clients = clientsRaw ? JSON.parse(clientsRaw) : []
      const clientProfile = {
        user_id: clientId,
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone,
        diary_id: null,
        patient_card_id: null,
        organization_id: null,
        caregiver_id: caregiverInvite.caregiver_id ?? null,
        created_at: now,
        updated_at: now,
      }
      const nextClients = [...clients, clientProfile]
      localStorage.setItem('local_clients', JSON.stringify(nextClients))

      try {
        const tokensRaw = localStorage.getItem('caregiver_client_invite_tokens')
        const tokens = tokensRaw ? JSON.parse(tokensRaw) : []
        const tokenIndex = tokens.findIndex((item: any) => String(item.token) === String(token))
        if (tokenIndex !== -1) {
          tokens[tokenIndex] = {
            ...tokens[tokenIndex],
            used_at: now,
            used_by: clientId,
          }
          localStorage.setItem('caregiver_client_invite_tokens', JSON.stringify(tokens))
        }
      } catch (inviteUpdateError) {
        console.warn('Не удалось обновить статус пригласительной ссылки', inviteUpdateError)
      }

      const currentUser = {
        id: clientId,
        user_role: 'client',
        phone,
        organization_id: null,
        caregiver_id: caregiverInvite.caregiver_id ?? null,
        diary_id: null,
        patient_card_id: null,
        profile_data: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone,
        },
      }

      localStorage.setItem('current_user', JSON.stringify(currentUser))
      localStorage.setItem('auth_token', `client_token_${clientId}`)
      setUser(currentUser as any)

      setStatus('processing')
      navigate('/profile')
    } catch (err) {
      console.error('Ошибка регистрации клиента по ссылке сиделки', err)
      setError('Не удалось завершить регистрацию. Попробуйте ещё раз.')
      setStatus('form')
    }
  }

  if (status === 'loading') {
    return (
      <div className="space-y-4 text-center">
        <div className="animate-spin w-12 h-12 border-4 border-[#7DD3DC] border-t-transparent rounded-full mx-auto"></div>
        <p className="text-gray-600 text-sm">Проверяем приглашение...</p>
      </div>
    )
  }

  if (status === 'invalid' && error) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3 text-center">
          <h1 className="text-xl font-semibold text-gray-dark">Ссылка недоступна</h1>
          <p className="text-sm text-gray-600 leading-relaxed">{error}</p>
        </div>
        <Button onClick={() => navigate('/login')} fullWidth>
          Перейти ко входу
        </Button>
      </div>
    )
  }

  if (flowType === 'caregiver') {
    if (!caregiverInvite) {
      return null
    }

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3 text-center">
          <h1 className="text-2xl font-semibold text-gray-dark">Регистрация клиента</h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            После регистрации вы сможете создать карточку подопечного и вести дневник вместе с приглашавшим специалистом.
          </p>
          {caregiverUser && (
            <p className="text-sm text-[#4A4A4A]/70">
              Пригласил: {`${caregiverUser.first_name || ''} ${caregiverUser.last_name || ''}`.trim() || 'Ваш специалист'}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit(handleCaregiverSubmit)} className="bg-white rounded-3xl shadow-sm p-6 space-y-5">
          <Input
            label="Имя"
            placeholder="Введите имя"
            error={errors.firstName?.message}
            fullWidth
            {...register('firstName')}
          />
          <Input
            label="Фамилия"
            placeholder="Введите фамилию"
            error={errors.lastName?.message}
            fullWidth
            {...register('lastName')}
          />
          <Input
            label="Телефон"
            placeholder="+7 (___) ___-__-__"
            error={errors.phone?.message}
            fullWidth
            {...register('phone')}
          />
          <Input
            label="Пароль"
            type="password"
            placeholder="Введите пароль"
            error={errors.password?.message}
            helperText="Минимум 6 символов"
            fullWidth
            {...register('password')}
          />
          <Input
            label="Подтвердите пароль"
            type="password"
            placeholder="Повторите пароль"
            error={errors.confirmPassword?.message}
            fullWidth
            {...register('confirmPassword')}
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          <Button type="submit" fullWidth isLoading={status === 'processing'}>
            Завершить регистрацию
          </Button>
        </form>

        <div className="bg-white rounded-3xl shadow-sm p-5 space-y-3 text-sm text-gray-600">
          <p className="text-center text-gray-500">
            Если регистрация уже выполнена, войдите с помощью телефона и пароля на странице входа.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate('/login')}
            fullWidth
          >
            Перейти ко входу
          </Button>
        </div>
      </div>
    )
  }

  if (!linkInfo || !diaryInfo) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3 text-center">
        <h1 className="text-2xl font-semibold text-gray-dark">
          Регистрация клиента
        </h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          После регистрации вы получите доступ к дневнику и сможете управлять правами доступа.
        </p>
      </div>

      <form onSubmit={handleSubmit(handleOrganizationSubmit)} className="bg-white rounded-3xl shadow-sm p-6 space-y-5">
        <Input
          label="Имя"
          placeholder="Введите имя"
          error={errors.firstName?.message}
          fullWidth
          {...register('firstName')}
        />
        <Input
          label="Фамилия"
          placeholder="Введите фамилию"
          error={errors.lastName?.message}
          fullWidth
          {...register('lastName')}
        />
        <Input
          label="Телефон"
          placeholder="+7 (___) ___-__-__"
          error={errors.phone?.message}
          fullWidth
          {...register('phone')}
        />
        <Input
          label="Пароль"
          type="password"
          placeholder="Введите пароль"
          error={errors.password?.message}
          helperText="Минимум 6 символов"
          fullWidth
          {...register('password')}
        />
        <Input
          label="Подтвердите пароль"
          type="password"
          placeholder="Повторите пароль"
          error={errors.confirmPassword?.message}
          fullWidth
          {...register('confirmPassword')}
        />

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        <Button type="submit" fullWidth isLoading={status === 'processing'}>
          Завершить регистрацию
        </Button>
      </form>

      <div className="bg-white rounded-3xl shadow-sm p-5 space-y-3 text-sm text-gray-600">
        <p className="text-center text-gray-500">
          Если регистрация уже выполнена, войдите с помощью телефона и пароля на странице входа.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate('/login')}
          fullWidth
        >
          Перейти ко входу
        </Button>
      </div>
    </div>
  )
}


