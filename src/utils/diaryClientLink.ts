export interface DiaryRecord {
  id: string
  owner_id: string
  client_id: string
  patient_card_id: string
  caregiver_id: string | null
  organization_id: string | null
  created_at: string
  [key: string]: any
}

export interface PatientCardRecord {
  id: string
  client_id: string
  [key: string]: any
}

export interface DiaryClientLink {
  link: string
  created_at: string
  token: string
  diary_id?: string
  patient_card_id?: string | null
  organization_id?: string | null
  accepted_by?: string | null
  accepted_at?: string | null
  client_id?: string | null
}

interface NormalizeOptions {
  diaryId?: string
  patientCardId?: string | null
  organizationId?: string | null
}

const getOrigin = () => {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin
  }
  return 'http://localhost'
}

export const normalizeClientLink = (
  entry: any,
  options: NormalizeOptions = {}
): DiaryClientLink | null => {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const origin = getOrigin()
  const created_at =
    typeof entry.created_at === 'string' ? entry.created_at : new Date().toISOString()

  let token = typeof entry.token === 'string' ? entry.token : ''
  let link = typeof entry.link === 'string' ? entry.link : ''
  let diaryId = entry.diary_id ?? options.diaryId ?? ''
  let patientCardId =
    entry.patient_card_id ?? (options.patientCardId !== undefined ? options.patientCardId : null)
  let organizationId =
    entry.organization_id ?? (options.organizationId !== undefined ? options.organizationId : null)

  if (link) {
    try {
      const url = new URL(link, origin)
      token = token || url.searchParams.get('token') || url.searchParams.get('client') || ''
      diaryId = diaryId || url.searchParams.get('diary') || ''
    } catch {
      // если ссылка некорректна — игнорируем и пересобираем позже
    }
  }

  if (!token) {
    token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  if (!diaryId && typeof entry.diary_id === 'string') {
    diaryId = entry.diary_id
  }

  let finalLink = link

  if (!finalLink || !finalLink.includes('/client-invite')) {
    const url = new URL('/client-invite', origin)
    if (diaryId) {
      url.searchParams.set('diary', diaryId)
    }
    url.searchParams.set('token', token)
    finalLink = url.toString()
  } else {
    try {
      const url = new URL(finalLink, origin)
      if (diaryId) {
        url.searchParams.set('diary', diaryId)
      }
      url.searchParams.set('token', token)
      finalLink = url.toString()
    } catch {
      const url = new URL('/client-invite', origin)
      if (diaryId) {
        url.searchParams.set('diary', diaryId)
      }
      url.searchParams.set('token', token)
      finalLink = url.toString()
    }
  }

  return {
    link: finalLink,
    created_at,
    token,
    diary_id: diaryId || options.diaryId,
    patient_card_id: patientCardId ?? null,
    organization_id: organizationId ?? null,
    accepted_by:
      entry.accepted_by === null || entry.accepted_by === undefined ? null : entry.accepted_by,
    accepted_at:
      entry.accepted_at === null || entry.accepted_at === undefined ? null : entry.accepted_at,
  }
}

interface AttachClientResult {
  diary: DiaryRecord | null
  patientCard: PatientCardRecord | null
}

export const attachClientToDiary = ({
  diaryId,
  clientId,
}: {
  diaryId: string
  clientId: string
}): AttachClientResult => {
  const diariesRaw = localStorage.getItem('diaries')
  const diaries: DiaryRecord[] = diariesRaw ? JSON.parse(diariesRaw) : []
  let updatedDiary: DiaryRecord | null = null

  const updatedDiaries = diaries.map(diary => {
    if (String(diary.id) === String(diaryId)) {
      updatedDiary = {
        ...diary,
        owner_id: clientId,
        client_id: clientId,
      }
      return updatedDiary
    }
    return diary
  })

  if (updatedDiary) {
    localStorage.setItem('diaries', JSON.stringify(updatedDiaries))
  }

  const cardsRaw = localStorage.getItem('patient_cards')
  const cards: PatientCardRecord[] = cardsRaw ? JSON.parse(cardsRaw) : []
  let updatedCard: PatientCardRecord | null = null

  const updatedCards = cards.map(card => {
    if (
      updatedDiary &&
      card.id &&
      String(card.id) === String(updatedDiary.patient_card_id)
    ) {
      updatedCard = {
        ...card,
        client_id: clientId,
      }
      return updatedCard
    }
    return card
  })

  if (updatedCard) {
    localStorage.setItem('patient_cards', JSON.stringify(updatedCards))
  }

  return {
    diary: updatedDiary,
    patientCard: updatedCard,
  }
}


