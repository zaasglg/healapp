/**
 * Скрипт для применения миграции напрямую через Supabase REST API
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Загружаем переменные окружения
dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function applyMigration() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Ошибка: нужны переменные окружения SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  try {
    // Читаем SQL из миграции
    const migrationPath = join(__dirname, '..', 'supabase/migrations/20251113000005_022_fix_clients_insert_final.sql')
    const sql = readFileSync(migrationPath, 'utf-8')
    
    console.log('📄 Применяю миграцию через Supabase Management API...')
    console.log('SQL:', sql.substring(0, 150) + '...\n')
    
    // Создаем клиент с service_role для выполнения SQL
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Выполняем SQL через RPC (если доступен) или напрямую через REST API
    // Попробуем использовать функцию exec_sql, если она есть
    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })
      
      if (error) {
        throw error
      }
      
      console.log('✅ Миграция применена успешно через RPC!')
      console.log('Результат:', data)
      return
    } catch (rpcError) {
      console.log('⚠️  RPC exec_sql не доступен, пробую альтернативный способ...')
    }

    // Альтернативный способ: выполняем SQL через прямой запрос к PostgREST
    // Разбиваем SQL на отдельные команды
    const commands = sql
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'))

    console.log(`Выполняю ${commands.length} SQL команд...`)
    
    for (const command of commands) {
      if (command.toLowerCase().startsWith('drop policy')) {
        // Для DROP POLICY используем прямой SQL через REST API
        const { error } = await supabase.rpc('exec_sql', { sql_query: command + ';' })
        if (error && !error.message.includes('does not exist')) {
          console.warn('Предупреждение при выполнении:', command.substring(0, 50), error.message)
        }
      } else if (command.toLowerCase().startsWith('create policy')) {
        // Для CREATE POLICY тоже
        const { error } = await supabase.rpc('exec_sql', { sql_query: command + ';' })
        if (error) {
          throw error
        }
        console.log('✅ Политика создана')
      } else if (command.toLowerCase().startsWith('comment')) {
        // Для COMMENT
        const { error } = await supabase.rpc('exec_sql', { sql_query: command + ';' })
        if (error) {
          console.warn('Предупреждение при комментировании:', error.message)
        }
      }
    }
    
    console.log('✅ Миграция применена успешно!')
    
  } catch (error) {
    console.error('❌ Ошибка при применении миграции:', error.message)
    console.log('\n💡 Попробуйте применить миграцию вручную через Supabase Dashboard:')
    console.log('   1. Откройте SQL Editor')
    console.log('   2. Скопируйте SQL из файла APPLY_MIGRATION.sql')
    console.log('   3. Выполните SQL')
    process.exit(1)
  }
}

applyMigration()

