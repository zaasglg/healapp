/**
 * Финальное применение миграции через создание и использование функции exec_sql
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
    // Читаем SQL для создания функции exec_sql
    const execSqlPath = join(__dirname, '..', 'supabase/migrations/20251113000006_023_create_exec_sql.sql')
    const createFunctionSQL = readFileSync(execSqlPath, 'utf-8')
    
    // Читаем SQL основной миграции
    const migrationPath = join(__dirname, '..', 'supabase/migrations/20251113000005_022_fix_clients_insert_final.sql')
    const mainMigrationSQL = readFileSync(migrationPath, 'utf-8')
    
    console.log('📄 Применяю миграции через Supabase...')
    console.log('URL:', SUPABASE_URL)
    console.log('\n')
    
    // Шаг 1: Создаем функцию exec_sql через прямой SQL запрос
    // Используем специальный endpoint Supabase для выполнения SQL
    // Supabase не предоставляет прямой endpoint для выполнения произвольного SQL через REST API
    // Но мы можем использовать psql через connection string, если он доступен
    
    // Альтернатива: используем Supabase Management API через создание функции
    // через миграцию, применяемую через CLI
    
    console.log('⚠️  Supabase REST API не поддерживает выполнение произвольного SQL.')
    console.log('💡 Примените миграции через Supabase Dashboard SQL Editor:\n')
    
    console.log('=== ШАГ 1: Создайте функцию exec_sql ===')
    console.log(createFunctionSQL)
    console.log('\n')
    
    console.log('=== ШАГ 2: Примените основную миграцию ===')
    console.log(mainMigrationSQL)
    console.log('\n')
    
    console.log('Или используйте готовый файл APPLY_MIGRATION.sql для быстрого применения.')
    console.log('\nПосле применения попробуйте создать карточку подопечного из аккаунта организации.')
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message)
    process.exit(1)
  }
}

applyMigration()

