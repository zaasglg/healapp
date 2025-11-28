import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type EmployeeRole = 'admin' | 'manager' | 'caregiver' | 'doctor'

/**
 * Получает роль сотрудника из таблицы organization_employees
 */
export const getEmployeeRole = async (userId: string): Promise<EmployeeRole | null> => {
  try {
    const { data, error } = await supabase
      .from('organization_employees')
      .select('role')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      return null
    }

    return (data.role as EmployeeRole) || null
  } catch (error) {
    console.error('Ошибка получения роли сотрудника:', error)
    return null
  }
}

/**
 * Проверяет, может ли пользователь создавать дневники и карточки
 */
export const canCreateDiariesAndCards = async (user: User | null): Promise<boolean> => {
  if (!user) return false

  // Организации и частные сиделки могут создавать
  const orgType = user.user_metadata?.organization_type
  if (orgType && ['pension', 'patronage_agency', 'caregiver'].includes(orgType)) {
    return true
  }

  // Клиенты могут создавать
  const userRole = user.user_metadata?.user_role || user.user_metadata?.role
  if (userRole === 'client') {
    return true
  }

  // Сотрудники: только администраторы и руководители
  if (userRole === 'org_employee') {
    const employeeRole = await getEmployeeRole(user.id)
    return employeeRole === 'admin' || employeeRole === 'manager'
  }

  return false
}

/**
 * Проверяет, может ли пользователь редактировать дневники и карточки
 */
export const canEditDiariesAndCards = async (user: User | null): Promise<boolean> => {
  if (!user) return false

  // Организации и частные сиделки могут редактировать
  const orgType = user.user_metadata?.organization_type
  if (orgType && ['pension', 'patronage_agency', 'caregiver'].includes(orgType)) {
    return true
  }

  // Клиенты могут редактировать свои карточки
  const userRole = user.user_metadata?.user_role || user.user_metadata?.role
  if (userRole === 'client') {
    return true
  }

  // Сотрудники: только администраторы и руководители
  if (userRole === 'org_employee') {
    const employeeRole = await getEmployeeRole(user.id)
    return employeeRole === 'admin' || employeeRole === 'manager'
  }

  return false
}

/**
 * Проверяет, может ли пользователь заполнять дневники
 */
export const canFillDiaries = async (user: User | null): Promise<boolean> => {
  if (!user) return false

  // Организации, частные сиделки и клиенты могут заполнять
  const orgType = user.user_metadata?.organization_type
  if (orgType && ['pension', 'patronage_agency', 'caregiver'].includes(orgType)) {
    return true
  }

  const userRole = user.user_metadata?.user_role || user.user_metadata?.role
  if (userRole === 'client') {
    return true
  }

  // Сотрудники: все могут заполнять
  if (userRole === 'org_employee') {
    return true
  }

  return false
}

/**
 * Проверяет, может ли пользователь управлять доступом клиентов (создавать приглашения)
 */
export const canManageClientAccess = async (user: User | null): Promise<boolean> => {
  if (!user) return false

  // Организации могут управлять доступом
  const orgType = user.user_metadata?.organization_type
  if (orgType && ['pension', 'patronage_agency'].includes(orgType)) {
    return true
  }

  // Сотрудники: только руководители
  const userRole = user.user_metadata?.user_role || user.user_metadata?.role
  if (userRole === 'org_employee') {
    const employeeRole = await getEmployeeRole(user.id)
    return employeeRole === 'manager'
  }

  return false
}

/**
 * Проверяет, может ли пользователь управлять доступом сотрудников к дневнику
 */
export const canManageEmployeeAccess = async (user: User | null): Promise<boolean> => {
  if (!user) return false

  // Организации могут управлять доступом
  const orgType = user.user_metadata?.organization_type
  if (orgType && ['pension', 'patronage_agency'].includes(orgType)) {
    return true
  }

  // Сотрудники: только руководители
  const userRole = user.user_metadata?.user_role || user.user_metadata?.role
  if (userRole === 'org_employee') {
    const employeeRole = await getEmployeeRole(user.id)
    return employeeRole === 'manager'
  }

  return false
}

/**
 * Проверяет, может ли пользователь редактировать показатели дневника
 */
export const canEditDiaryMetrics = async (user: User | null): Promise<boolean> => {
  if (!user) return false

  // Организации и клиенты могут редактировать показатели
  const orgType = user.user_metadata?.organization_type
  if (orgType && ['pension', 'patronage_agency'].includes(orgType)) {
    return true
  }

  const userRole = user.user_metadata?.user_role || user.user_metadata?.role
  if (userRole === 'client') {
    return true
  }

  // Сотрудники: администраторы и руководители могут редактировать показатели
  if (userRole === 'org_employee') {
    const employeeRole = await getEmployeeRole(user.id)
    return employeeRole === 'admin' || employeeRole === 'manager'
  }

  return false
}

