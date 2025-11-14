/**
 * Применение миграции напрямую через Supabase с использованием service_role
 * Использует прямой подход через создание функции и её использование
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

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
    console.log('📄 Применяю миграцию через Supabase...')
    console.log('URL:', SUPABASE_URL)
    console.log('\n')
    
    // Создаем клиент с service_role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public'
      }
    })

    // Читаем SQL из полной миграции
    const migrationPath = join(__dirname, '..', 'APPLY_MIGRATION_COMPLETE.sql')
    let sql = readFileSync(migrationPath, 'utf-8')
    
    // Убираем комментарии для чистого SQL
    sql = sql
      .split('\n')
      .filter(line => {
        const trimmed = line.trim()
        return trimmed.length > 0 && !trimmed.startsWith('--') && !trimmed.startsWith('===')
      })
      .join('\n')
      .trim()
    
    console.log('SQL для применения:')
    console.log(sql.substring(0, 200) + '...\n')
    
    // Разбиваем SQL на отдельные команды
    const commands = sql
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0)
    
    console.log(`Выполняю ${commands.length} SQL команд...\n`)
    
    // Выполняем каждую команду через Supabase
    // Используем прямой запрос к PostgREST через функцию, если она существует
    // Или создаем функцию сначала
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i] + ';'
      console.log(`[${i + 1}/${commands.length}] Выполняю: ${command.substring(0, 60)}...`)
      
      try {
        // Пробуем выполнить через RPC exec_sql, если функция существует
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: command })
        
        if (error) {
          // Если функция не существует, создаем её первой командой
          if (error.message.includes('Could not find the function') && i === 0) {
            console.log('⚠️  Функция exec_sql не найдена, создаю её...')
            
            // Создаем функцию exec_sql через прямой SQL запрос
            // Используем специальный подход - создаем функцию через миграцию
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
            
            // Применяем создание функции через Supabase CLI или другой способ
            console.log('💡 Создайте функцию exec_sql вручную через Supabase Dashboard:')
            console.log(createFunctionSQL)
            console.log('\nЗатем запустите этот скрипт снова.')
            return
          }
          
          throw error
        }
        
        console.log(`✅ Команда ${i + 1} выполнена успешно`)
      } catch (error) {
        console.error(`❌ Ошибка при выполнении команды ${i + 1}:`, error.message)
        throw error
      }
    }
    
    console.log('\n✅ Миграция применена успешно!')
    console.log('Теперь попробуйте создать карточку подопечного из аккаунта организации.')
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message)
    console.log('\n💡 Примените миграцию вручную через Supabase Dashboard:')
    console.log('   1. Откройте SQL Editor')
    console.log('   2. Скопируйте SQL из файла APPLY_MIGRATION_COMPLETE.sql')
    console.log('   3. Выполните SQL')
    process.exit(1)
  }
}

applyMigration()

