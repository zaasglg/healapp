/**
 * Применение миграции через прямой HTTP запрос к Supabase Management API
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function applyMigration() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Ошибка: нужны переменные окружения')
    process.exit(1)
  }

  try {
    // Читаем SQL из миграции
    const migrationPath = join(__dirname, '..', 'supabase/migrations/20251113000005_022_fix_clients_insert_final.sql')
    let sql = readFileSync(migrationPath, 'utf-8')
    
    // Убираем комментарии для чистого SQL
    sql = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .trim()
    
    console.log('📄 Применяю миграцию через Supabase Management API...')
    console.log('URL:', SUPABASE_URL)
    console.log('\nSQL:')
    console.log(sql)
    console.log('\n')
    
    // Выполняем SQL через Management API
    // Используем прямой запрос к PostgREST с service_role
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ sql_query: sql }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Ошибка HTTP:', response.status, response.statusText)
      console.error('Ответ:', errorText)
      
      // Если RPC не существует, создадим его или используем альтернативный способ
      console.log('\n💡 RPC exec_sql не найден. Создаю функцию для выполнения SQL...')
      
      // Создаем функцию exec_sql
      const createFunctionSQL = `
        create or replace function public.exec_sql(sql_query text)
        returns void
        language plpgsql
        security definer
        as $$
        begin
          execute sql_query;
        end;
        $$;
      `
      
      const createResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql_query: createFunctionSQL }),
      })
      
      if (!createResponse.ok) {
        throw new Error(`Не удалось создать функцию: ${createResponse.status}`)
      }
      
      console.log('✅ Функция exec_sql создана, повторяю выполнение миграции...')
      
      // Повторяем выполнение миграции
      const retryResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql_query: sql }),
      })
      
      if (!retryResponse.ok) {
        const errorText = await retryResponse.text()
        throw new Error(`Ошибка выполнения SQL: ${retryResponse.status} - ${errorText}`)
      }
      
      const result = await retryResponse.json()
      console.log('✅ Миграция применена успешно!')
      console.log('Результат:', result)
      return
    }

    const result = await response.json()
    console.log('✅ Миграция применена успешно!')
    console.log('Результат:', result)
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message)
    console.log('\n💡 Примените миграцию вручную через Supabase Dashboard:')
    console.log('   1. Откройте SQL Editor')
    console.log('   2. Скопируйте SQL из файла APPLY_MIGRATION.sql')
    console.log('   3. Выполните SQL')
    process.exit(1)
  }
}

applyMigration()

