/**
 * Route Service - работа с маршрутными листами через Supabase
 * Таблицы: route_templates, route_template_slots, route_assignments, route_events, route_attachments
 */

import { supabase } from './supabase'

// ============= TYPES =============

export interface RouteTemplate {
  id: string
  diary_id: string
  metric_type: string | null
  title: string
  description: string | null
  created_by: string
  organization_id: string | null
  visible_to: 'organization' | 'client' | 'staff'
  created_at: string
  updated_at: string
}

export interface RouteTemplateSlot {
  id: string
  template_id: string
  day_of_week: number | null // 0=ПН, 1=ВТ, ..., 6=ВС
  from_time: string // 'HH:MM:SS' or 'HH:MM'
  to_time: string
  position: number
  default_assigned_employee: string | null
  allow_multiple_assignments: boolean
  created_at: string
  updated_at: string
}

export interface RouteAssignment {
  id: string
  template_id: string
  slot_id: string
  event_date: string | null // null = default for all dates
  assigned_employee_id: string
  assigned_by: string
  created_at: string
}

export type RouteEventStatus = 'scheduled' | 'done' | 'not_done' | 'rescheduled' | 'cancelled' | 'missed'

export interface RouteEvent {
  id: string
  template_id: string
  slot_id: string
  event_date: string
  event_from: string
  event_to: string
  status: RouteEventStatus
  performed_by: string | null
  performed_at: string | null
  reason: string | null
  comment: string | null
  created_by: string
  created_at: string
}

export interface RouteAttachment {
  id: string
  event_id: string
  storage_key: string
  uploaded_by: string
  created_at: string
}

// Структура для отображения на фронтенде (объединённая информация)
export interface RouteSlotForDate {
  template_id: string
  slot_id: string
  diary_id: string
  title: string
  metric_type: string | null
  description: string | null
  day_of_week: number | null
  from_time: string
  to_time: string
  position: number
  assigned_employee_id: string | null
  allow_multiple_assignments: boolean
  // Статус события (если есть)
  event_id: string | null
  status: RouteEventStatus | null
  performed_by: string | null
  performed_at: string | null
  reason: string | null
  comment: string | null
}

// Локальная структура для совместимости с текущим кодом
export interface LocalRouteSchedule {
  days: number[]
  times: Array<{ from: string; to: string }>
}

// ============= HELPERS =============

/**
 * Конвертирует time из Postgres 'HH:MM:SS' в 'HH:MM'
 */
function normalizeTime(t: string | null | undefined): string {
  if (!t) return '07:00'
  // Если формат HH:MM:SS, обрезаем секунды
  const parts = t.split(':')
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
  }
  return '07:00'
}

/**
 * Конвертирует 'HH:MM' в 'HH:MM:SS' для Postgres
 */
function toDbTime(t: string): string {
  if (!t) return '07:00:00'
  const parts = t.split(':')
  if (parts.length === 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`
  }
  if (parts.length === 3) {
    return t
  }
  return '07:00:00'
}

// ============= FETCH OPERATIONS =============

/**
 * Загружает все шаблоны маршрутных листов для дневника
 */
export async function fetchRouteTemplates(diaryId: string): Promise<RouteTemplate[]> {
  const { data, error } = await supabase
    .from('route_templates')
    .select('*')
    .eq('diary_id', diaryId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[routeService] fetchRouteTemplates error:', error)
    return []
  }
  // Debug helper: log when templates are found
  if (data && data.length) console.log('[routeService] fetchRouteTemplates: found', data.length, 'templates for diary', diaryId)
  return data || []
}

/**
 * Загружает все слоты для шаблонов (по списку template_id)
 */
export async function fetchRouteSlots(templateIds: string[]): Promise<RouteTemplateSlot[]> {
  if (!templateIds.length) return []

  const { data, error } = await supabase
    .from('route_template_slots')
    .select('*')
    .in('template_id', templateIds)
    .order('position', { ascending: true })

  if (error) {
    console.error('[routeService] fetchRouteSlots error:', error)
    return []
  }
  if (data && data.length) console.log('[routeService] fetchRouteSlots: found', data.length, 'slots for templates', templateIds)
  return (data || []).map((s) => ({
    ...s,
    from_time: normalizeTime(s.from_time),
    to_time: normalizeTime(s.to_time),
  }))
}

/**
 * Загружает назначения сотрудников для шаблонов (default или на конкретную дату)
 */
export async function fetchRouteAssignments(
  templateIds: string[],
  eventDate?: string
): Promise<RouteAssignment[]> {
  if (!templateIds.length) return []

  let query = supabase
    .from('route_assignments')
    .select('*')
    .in('template_id', templateIds)

  // Загружаем default (event_date IS NULL) и назначения на конкретную дату
  if (eventDate) {
    query = query.or(`event_date.is.null,event_date.eq.${eventDate}`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[routeService] fetchRouteAssignments error:', error)
    return []
  }
  return data || []
}

/**
 * Загружает события (статусы выполнения) для слотов на конкретную дату
 */
export async function fetchRouteEvents(
  slotIds: string[],
  eventDate: string
): Promise<RouteEvent[]> {
  if (!slotIds.length) return []

  const { data, error } = await supabase
    .from('route_events')
    .select('*')
    .in('slot_id', slotIds)
    .eq('event_date', eventDate)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[routeService] fetchRouteEvents error:', error)
    return []
  }
  return (data || []).map((e) => ({
    ...e,
    event_from: normalizeTime(e.event_from),
    event_to: normalizeTime(e.event_to),
  }))
}

/**
 * Объединённая загрузка маршрутного листа для даты
 * Возвращает список слотов с информацией о шаблоне, назначении и последнем статусе события
 */
export async function fetchRouteForDate(
  diaryId: string,
  date: string,
  employeeId?: string // фильтр по сотруднику (для персонального маршрутного листа)
): Promise<RouteSlotForDate[]> {
  // 1. Загружаем шаблоны
  const templates = await fetchRouteTemplates(diaryId)
  if (!templates.length) return []

  const templateIds = templates.map((t) => t.id)
  const templateMap = new Map(templates.map((t) => [t.id, t]))

  // 2. Загружаем слоты
  const slots = await fetchRouteSlots(templateIds)
  if (!slots.length) return []

  // Определяем день недели для фильтрации (0=ПН, ..., 6=ВС)
  const d = new Date(date)
  const jsDay = d.getDay() // 0=воскресенье
  const dayIndex = (jsDay + 6) % 7 // конвертируем: 0=ПН, 6=ВС

  // Фильтруем слоты по дню недели (или day_of_week IS NULL = ежедневно)
  const slotsForDay = slots.filter(
    (s) => s.day_of_week === null || s.day_of_week === dayIndex
  )
  if (!slotsForDay.length) return []

  const slotIds = slotsForDay.map((s) => s.id)

  // 3. Загружаем назначения
  const assignments = await fetchRouteAssignments(templateIds, date)
  // Группируем назначения по slot_id, приоритет: конкретная дата > default
  const assignmentMap = new Map<string, RouteAssignment>()
  assignments.forEach((a) => {
    const existing = assignmentMap.get(a.slot_id)
    if (!existing) {
      assignmentMap.set(a.slot_id, a)
    } else if (a.event_date && !existing.event_date) {
      // Конкретная дата имеет приоритет над default
      assignmentMap.set(a.slot_id, a)
    }
  })

  // 4. Загружаем события (последний статус для каждого слота)
  const events = await fetchRouteEvents(slotIds, date)
  // Берём последнее событие для каждого слота
  const eventMap = new Map<string, RouteEvent>()
  events.forEach((e) => {
    if (!eventMap.has(e.slot_id)) {
      eventMap.set(e.slot_id, e)
    }
  })

  // 5. Собираем результат
  const result: RouteSlotForDate[] = []
  for (const slot of slotsForDay) {
    const template = templateMap.get(slot.template_id)
    if (!template) continue

    const assignment = assignmentMap.get(slot.id)
    const event = eventMap.get(slot.id)

    // Если фильтр по сотруднику, проверяем назначение
    const assignedTo = assignment?.assigned_employee_id || slot.default_assigned_employee
    if (employeeId && assignedTo && assignedTo !== employeeId && !slot.allow_multiple_assignments) {
      continue // Пропускаем слоты, назначенные другому сотруднику
    }

    result.push({
      template_id: template.id,
      slot_id: slot.id,
      diary_id: template.diary_id,
      title: template.title,
      metric_type: template.metric_type,
      description: template.description,
      day_of_week: slot.day_of_week,
      from_time: slot.from_time,
      to_time: slot.to_time,
      position: slot.position,
      assigned_employee_id: assignedTo || null,
      allow_multiple_assignments: slot.allow_multiple_assignments,
      event_id: event?.id || null,
      status: event?.status || null,
      performed_by: event?.performed_by || null,
      performed_at: event?.performed_at || null,
      reason: event?.reason || null,
      comment: event?.comment || null,
    })
  }

  // Сортируем по времени начала
  result.sort((a, b) => {
    const aMin = timeToMinutes(a.from_time)
    const bMin = timeToMinutes(b.from_time)
    return aMin - bMin
  })

  return result
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function minutesToHM(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ============= SAVE/UPDATE OPERATIONS =============

/**
 * Создаёт или обновляет шаблон маршрутной задачи с слотами
 * Используется при сохранении из модального окна RouteManipulationModal
 */
export async function saveRouteTemplate(
  diaryId: string,
  metricType: string,
  title: string,
  days: number[],
  times: Array<{ from: string; to: string }>,
  createdBy: string,
  organizationId?: string | null
): Promise<{ templateId: string; slotIds: string[] } | null> {
  try {
    // 1. Проверяем, есть ли уже шаблон для этого metric_type в этом дневнике
    const { data: existingTemplates } = await supabase
      .from('route_templates')
      .select('id')
      .eq('diary_id', diaryId)
      .eq('metric_type', metricType)
      .limit(1)

    let templateId: string

    if (existingTemplates && existingTemplates.length > 0) {
      // Обновляем существующий шаблон
      templateId = existingTemplates[0].id
      await supabase
        .from('route_templates')
        .update({
          title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateId)

      // Удаляем старые слоты (будем пересоздавать)
      await supabase
        .from('route_template_slots')
        .delete()
        .eq('template_id', templateId)
    } else {
      // Создаём новый шаблон
      const { data: newTemplate, error: templateError } = await supabase
        .from('route_templates')
        .insert({
          diary_id: diaryId,
          metric_type: metricType,
          title,
          created_by: createdBy,
          organization_id: organizationId || null,
          visible_to: 'organization',
        })
        .select('id')
        .single()

      if (templateError || !newTemplate) {
        console.error('[routeService] saveRouteTemplate: failed to create template', templateError)
        return null
      }
      templateId = newTemplate.id
    }

    // 2. Создаём слоты для каждого дня и каждого временного диапазона
    const slotsToInsert: Array<{
      template_id: string
      day_of_week: number
      from_time: string
      to_time: string
      position: number
    }> = []

    let position = 0
    for (const day of days) {
      for (const time of times) {
        // Normalize missing values
        const fromHM = time.from || '07:00'
        let toHM = time.to ?? fromHM

        // Ensure ordering: to_time must be strictly after from_time to satisfy DB check
        let fromMin = timeToMinutes(fromHM)
        let toMin = timeToMinutes(toHM)
        if (toMin <= fromMin) {
          toMin = fromMin + 1 // add 1 minute minimum
          toHM = minutesToHM(toMin)
        }

        slotsToInsert.push({
          template_id: templateId,
          day_of_week: day,
          from_time: toDbTime(fromHM),
          to_time: toDbTime(toHM),
          position: position++,
        })
      }
    }

    if (slotsToInsert.length > 0) {
      const { data: insertedSlots, error: slotsError } = await supabase
        .from('route_template_slots')
        .insert(slotsToInsert)
        .select('id')

      if (slotsError) {
        console.error('[routeService] saveRouteTemplate: failed to create slots', slotsError)
        return null
      }

      return {
        templateId,
        slotIds: (insertedSlots || []).map((s) => s.id),
      }
    }

    return { templateId, slotIds: [] }
  } catch (err) {
    console.error('[routeService] saveRouteTemplate error:', err)
    return null
  }
}

/**
 * Удаляет шаблон маршрутной задачи (и каскадно все слоты/назначения/события)
 */
export async function deleteRouteTemplate(templateId: string): Promise<boolean> {
  const { error } = await supabase
    .from('route_templates')
    .delete()
    .eq('id', templateId)

  if (error) {
    console.error('[routeService] deleteRouteTemplate error:', error)
    return false
  }
  return true
}

/**
 * Удаляет шаблон по metric_type для дневника
 */
export async function deleteRouteTemplateByMetric(
  diaryId: string,
  metricType: string
): Promise<boolean> {
  const { error } = await supabase
    .from('route_templates')
    .delete()
    .eq('diary_id', diaryId)
    .eq('metric_type', metricType)

  if (error) {
    console.error('[routeService] deleteRouteTemplateByMetric error:', error)
    return false
  }
  return true
}

// ============= EVENT OPERATIONS =============

/**
 * Создаёт событие выполнения задачи
 */
export async function createRouteEvent(params: {
  templateId: string
  slotId: string
  eventDate: string
  eventFrom: string
  eventTo: string
  status: RouteEventStatus
  performedBy?: string | null
  reason?: string | null
  comment?: string | null
  createdBy: string
}): Promise<RouteEvent | null> {
  // Normalize event times and ensure event_to > event_from
  const eventFromHM = params.eventFrom || '07:00'
  let eventToHM = params.eventTo ?? eventFromHM
  let efMin = timeToMinutes(eventFromHM)
  let etMin = timeToMinutes(eventToHM)
  if (etMin <= efMin) {
    etMin = efMin + 1
    eventToHM = minutesToHM(etMin)
  }

  const { data, error } = await supabase
    .from('route_events')
    .insert({
      template_id: params.templateId,
      slot_id: params.slotId,
      event_date: params.eventDate,
      event_from: toDbTime(eventFromHM),
      event_to: toDbTime(eventToHM),
      status: params.status,
      performed_by: params.performedBy || null,
      performed_at: params.status === 'done' ? new Date().toISOString() : null,
      reason: params.reason || null,
      comment: params.comment || null,
      created_by: params.createdBy,
    })
    .select()
    .single()

  if (error) {
    console.error('[routeService] createRouteEvent error:', error)
    return null
  }

  return data
    ? {
        ...data,
        event_from: normalizeTime(data.event_from),
        event_to: normalizeTime(data.event_to),
      }
    : null
}

/**
 * Обновляет статус события
 */
export async function updateRouteEventStatus(
  eventId: string,
  status: RouteEventStatus,
  performedBy?: string,
  reason?: string,
  comment?: string
): Promise<boolean> {
  const updateData: Record<string, any> = {
    status,
  }

  if (status === 'done') {
    updateData.performed_by = performedBy || null
    updateData.performed_at = new Date().toISOString()
  }

  if (reason !== undefined) {
    updateData.reason = reason
  }

  if (comment !== undefined) {
    updateData.comment = comment
  }

  const { error } = await supabase
    .from('route_events')
    .update(updateData)
    .eq('id', eventId)

  if (error) {
    console.error('[routeService] updateRouteEventStatus error:', error)
    return false
  }

  return true
}

// ============= ASSIGNMENT OPERATIONS =============

/**
 * Назначает сотрудника на слот (default или на конкретную дату)
 */
export async function assignEmployeeToSlot(params: {
  templateId: string
  slotId: string
  eventDate?: string | null
  employeeId: string
  assignedBy: string
}): Promise<RouteAssignment | null> {
  // Проверяем, нет ли уже назначения
  const { data: existing } = await supabase
    .from('route_assignments')
    .select('id')
    .eq('template_id', params.templateId)
    .eq('slot_id', params.slotId)
    .eq('event_date', params.eventDate || null)
    .limit(1)

  if (existing && existing.length > 0) {
    // Обновляем существующее назначение
    const { data, error } = await supabase
      .from('route_assignments')
      .update({
        assigned_employee_id: params.employeeId,
        assigned_by: params.assignedBy,
      })
      .eq('id', existing[0].id)
      .select()
      .single()

    if (error) {
      console.error('[routeService] assignEmployeeToSlot update error:', error)
      return null
    }
    return data
  } else {
    // Создаём новое назначение
    const { data, error } = await supabase
      .from('route_assignments')
      .insert({
        template_id: params.templateId,
        slot_id: params.slotId,
        event_date: params.eventDate || null,
        assigned_employee_id: params.employeeId,
        assigned_by: params.assignedBy,
      })
      .select()
      .single()

    if (error) {
      console.error('[routeService] assignEmployeeToSlot insert error:', error)
      return null
    }
    return data
  }
}

/**
 * Удаляет назначение сотрудника со слота
 */
export async function removeEmployeeAssignment(
  slotId: string,
  eventDate?: string | null
): Promise<boolean> {
  let query = supabase
    .from('route_assignments')
    .delete()
    .eq('slot_id', slotId)

  if (eventDate) {
    query = query.eq('event_date', eventDate)
  } else {
    query = query.is('event_date', null)
  }

  const { error } = await query

  if (error) {
    console.error('[routeService] removeEmployeeAssignment error:', error)
    return false
  }
  return true
}

// ============= CONVERSION HELPERS =============

/**
 * Конвертирует данные из БД в локальный формат routeSchedules
 * (для совместимости с текущим кодом DiaryPage)
 */
export function convertToLocalSchedules(
  templates: RouteTemplate[],
  slots: RouteTemplateSlot[]
): Record<string, LocalRouteSchedule> {
  const result: Record<string, LocalRouteSchedule> = {}

  for (const template of templates) {
    if (!template.metric_type) continue

    const templateSlots = slots.filter((s) => s.template_id === template.id)
    if (!templateSlots.length) continue

    // Собираем уникальные дни
    const daysSet = new Set<number>()
    // Собираем уникальные временные диапазоны
    const timesMap = new Map<string, { from: string; to: string }>()

    for (const slot of templateSlots) {
      if (slot.day_of_week !== null) {
        daysSet.add(slot.day_of_week)
      }
      const timeKey = `${slot.from_time}_${slot.to_time}`
      if (!timesMap.has(timeKey)) {
        timesMap.set(timeKey, { from: slot.from_time, to: slot.to_time })
      }
    }

    result[template.metric_type] = {
      days: Array.from(daysSet).sort((a, b) => a - b),
      times: Array.from(timesMap.values()),
    }
  }

  return result
}

/**
 * Загружает маршрутные расписания для дневника и конвертирует в локальный формат
 */
export async function loadRouteSchedulesForDiary(
  diaryId: string
): Promise<Record<string, LocalRouteSchedule>> {
  const templates = await fetchRouteTemplates(diaryId)
  if (!templates.length) return {}

  const templateIds = templates.map((t) => t.id)
  const slots = await fetchRouteSlots(templateIds)

  return convertToLocalSchedules(templates, slots)
}
