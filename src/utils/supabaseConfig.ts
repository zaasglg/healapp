/**
 * Утилита для получения правильных URL для Supabase сервисов
 * Поддерживает как облачный Supabase, так и self-hosted
 */

/**
 * Получает базовый URL для Supabase API (REST API)
 */
export function getSupabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL || ''
}

/**
 * Получает Anon Key для Supabase
 */
export function getSupabaseAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY || ''
}

/**
 * Получает URL для Edge Functions
 * Для self-hosted: использует отдельный порт для функций (54325)
 * Для облачного: использует тот же URL что и REST API
 */
export function getFunctionsUrl(): string {
  const supabaseUrl = getSupabaseUrl()
  
  // Если это self-hosted (содержит IP и порт 54327 для REST API)
  // Или если это IP без порта (через nginx)
  if (supabaseUrl.includes(':54327')) {
    // Заменяем порт REST API на порт Functions (если используется прямой доступ)
    return supabaseUrl.replace(':54327', ':54325')
  }
  
  // Если URL без порта (через nginx), функции доступны через тот же URL
  // nginx проксирует /functions/ на порт 54325
  
  // Для облачного Supabase используем тот же URL
  return supabaseUrl.replace(/\/$/, '')
}

/**
 * Получает полный URL для конкретной Edge Function
 */
export function getFunctionUrl(functionName: string): string {
  const baseUrl = getFunctionsUrl().replace(/\/$/, '')
  return `${baseUrl}/functions/v1/${functionName}`
}

