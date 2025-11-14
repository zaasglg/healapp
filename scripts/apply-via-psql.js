/**
 * Применение миграции через psql (если доступен) или через создание RPC функции
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD

async function applyMigration() {
  if (!SUPABASE_URL) {
    console.error('❌ Ошибка: нужна переменная SUPABASE_URL')
    process.exit(1)
  }

  try {
    // Извлекаем project ref из URL
    const projectRef = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (!projectRef) {
      throw new Error('Не удалось извлечь project ref из URL')
    }

    // Читаем SQL из миграции
    const migrationPath = join(__dirname, '..', 'supabase/migrations/20251113000005_022_fix_clients_insert_final.sql')
    const sql = readFileSync(migrationPath, 'utf-8')
    
    console.log('📄 Применяю миграцию через Supabase...')
    console.log('Project ref:', projectRef)
    console.log('\nSQL:')
    console.log(sql.substring(0, 300) + '...\n')
    
    // Сначала создаем RPC функцию для выполнения SQL через миграцию
    // Затем используем её для применения основной миграции
    
    // Создаем временную миграцию для создания функции exec_sql
    const createExecSqlFunction = `
-- Создаем функцию для выполнения произвольного SQL (только для service_role)
create or replace function public.exec_sql(sql_query text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Проверяем, что вызывается с service_role
  if current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' then
    raise exception 'exec_sql может вызываться только с service_role';
  end if;
  
  execute sql_query;
end;
$$;

-- Разрешаем service_role вызывать эту функцию
grant execute on function public.exec_sql(text) to service_role;
    `
    
    console.log('Шаг 1: Создаю функцию exec_sql...')
    
    // Применяем через Supabase CLI или напрямую
    // Попробуем использовать npx supabase db execute
    try {
      // Используем Supabase CLI для выполнения SQL
      const { stdout, stderr } = await execAsync(
        `npx supabase db execute --linked --file -`,
        {
          input: createExecSqlFunction,
          maxBuffer: 1024 * 1024 * 10, // 10MB
        }
      )
      
      if (stderr && !stderr.includes('warning')) {
        console.warn('Предупреждение:', stderr)
      }
      
      console.log('✅ Функция exec_sql создана')
    } catch (error) {
      console.log('⚠️  Не удалось создать функцию через CLI, пробую альтернативный способ...')
      console.log('Примените SQL вручную через Dashboard')
    }
    
    // Теперь применяем основную миграцию
    console.log('\nШаг 2: Применяю основную миграцию...')
    
    try {
      const { stdout, stderr } = await execAsync(
        `npx supabase db execute --linked --file -`,
        {
          input: sql,
          maxBuffer: 1024 * 1024 * 10,
        }
      )
      
      if (stderr && !stderr.includes('warning')) {
        console.warn('Предупреждение:', stderr)
      }
      
      console.log('✅ Миграция применена успешно!')
      console.log('Результат:', stdout)
    } catch (error) {
      console.error('❌ Ошибка при применении миграции:', error.message)
      throw error
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message)
    console.log('\n💡 Примените миграцию вручную:')
    console.log('   1. Откройте Supabase Dashboard → SQL Editor')
    console.log('   2. Скопируйте SQL из файла APPLY_MIGRATION.sql')
    console.log('   3. Выполните SQL')
    process.exit(1)
  }
}

applyMigration()

