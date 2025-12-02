import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''

// Создаем клиент даже если переменные не установлены (для разработки)
// В production эти переменные должны быть установлены
export const supabase = createClient(
  supabaseUrl || 'https://supabase.healapp.ru',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
)

// Admin клиент с service_role ключом для обхода RLS
// ВНИМАНИЕ: Использовать ТОЛЬКО для локальной разработки!
// В production эти операции должны выполняться через Edge Functions
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(
      supabaseUrl || 'https://supabase.healapp.ru',
      supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  : null

// Предупреждение в консоли если переменные не установлены
if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('⚠️ Supabase environment variables are not set. Please configure .env.local file.')
}

if (supabaseServiceRoleKey) {
  console.warn('⚠️ Service Role Key detected. This should only be used in local development!')
}



