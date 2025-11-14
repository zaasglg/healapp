/**
 * Создание функции exec_sql и применение миграции через HTTP запросы
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

async function createExecSqlFunction() {
  // SQL для создания функции exec_sql
  const createFunctionSQL = `
CREATE OR REPLACE FUNCTION public.exec_sql(sql_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE sql_query;
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
  `.trim()

  console.log('📝 Создаю функцию exec_sql...')
  
  // Выполняем через прямой SQL запрос к PostgREST
  // Используем /rest/v1/ для выполнения SQL через функцию
  // Но сначала нужно создать функцию другим способом
  
  // Попробуем использовать Supabase Management API напрямую
  // Через /rest/v1/rpc/ мы не можем создать функцию, нужен другой подход
  
  // Используем прямой запрос к Postgres через connection string
  // Но у нас нет прямого доступа к Postgres, только через REST API
  
  // Альтернатива: создаем миграцию для функции exec_sql, применяем её,
  // затем используем функцию для применения основной миграции
  
  console.log('💡 Создаю миграцию для функции exec_sql...')
  
  const migrationContent = `-- Создание функции exec_sql для выполнения произвольного SQL
${createFunctionSQL}
`
  
  const migrationPath = join(__dirname, '..', 'supabase/migrations/20251113000006_023_create_exec_sql.sql')
  
  // Записываем миграцию
  const fs = await import('fs/promises')
  await fs.writeFile(migrationPath, migrationContent, 'utf-8')
  
  console.log('✅ Миграция для exec_sql создана:', migrationPath)
  console.log('Теперь примените обе миграции через Supabase Dashboard:')
  console.log('1. Сначала примените: 20251113000006_023_create_exec_sql.sql')
  console.log('2. Затем примените: 20251113000005_022_fix_clients_insert_final.sql')
  
  return migrationPath
}

async function applyMigration() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Ошибка: нужны переменные окружения')
    process.exit(1)
  }

  try {
    // Создаем функцию exec_sql
    await createExecSqlFunction()
    
    // Читаем SQL из основной миграции
    const migrationPath = join(__dirname, '..', 'supabase/migrations/20251113000005_022_fix_clients_insert_final.sql')
    const sql = readFileSync(migrationPath, 'utf-8')
    
    console.log('\n📄 SQL для применения основной миграции:')
    console.log(sql)
    console.log('\n')
    
    // После создания функции exec_sql, можем использовать её
    // Но сначала нужно применить миграцию функции вручную
    
    console.log('⚠️  Примените миграции в следующем порядке через Supabase Dashboard:')
    console.log('1. supabase/migrations/20251113000006_023_create_exec_sql.sql')
    console.log('2. supabase/migrations/20251113000005_022_fix_clients_insert_final.sql')
    console.log('\nИли используйте файл APPLY_MIGRATION.sql для быстрого применения основной миграции.')
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message)
    process.exit(1)
  }
}

applyMigration()

