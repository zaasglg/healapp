import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL;

if (!serviceRoleKey || !supabaseUrl) {
  throw new Error('Не заданы SUPABASE_SERVICE_ROLE_KEY или VITE_SUPABASE_URL');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('🚀 Запуск сидирования Supabase (демо-данные)');

  // 1. Создаём организацию патронажного агентства
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      organization_type: 'patronage_agency',
      name: 'Демо агентство «Забота»',
      phone: '+79990000010',
      address: 'Москва, ул. Примерная, 1',
    })
    .select()
    .single();

  if (orgError) throw orgError;
  console.log('✅ Организация создана:', org.id);

  // 2. Создаём клиента, связанного с организацией
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      first_name: 'Анна',
      last_name: 'Петрова',
      phone: '+79990000011',
      invited_by_organization_id: org.id,
    })
    .select()
    .single();

  if (clientError) throw clientError;
  console.log('✅ Клиент создан:', client.id);

  // 3. Карточка подопечного
  const { data: card, error: cardError } = await supabase
    .from('patient_cards')
    .insert({
      client_id: client.id,
      full_name: 'Иван Петров',
      mobility: 'ходит',
      diagnoses: JSON.stringify(['Гипертония']),
    })
    .select()
    .single();

  if (cardError) throw cardError;
  console.log('✅ Карточка подопечного создана:', card.id);

  // 4. Дневник
  const { data: diary, error: diaryError } = await supabase
    .from('diaries')
    .insert({
      owner_client_id: client.id,
      patient_card_id: card.id,
      organization_id: org.id,
      organization_type: 'patronage_agency',
      status: 'active',
    })
    .select()
    .single();

  if (diaryError) throw diaryError;
  console.log('✅ Дневник создан:', diary.id);

  // 5. Базовые показатели дневника (температура и давление)
  const metricsPayload = [
    { diary_id: diary.id, metric_key: 'temperature', is_pinned: true },
    { diary_id: diary.id, metric_key: 'blood_pressure', is_pinned: true },
  ];

  const { error: metricsError } = await supabase.from('diary_metrics').insert(metricsPayload);
  if (metricsError) throw metricsError;

  console.log('✅ Показатели добавлены:', metricsPayload.map((m) => m.metric_key).join(', '));

  console.log('\nГотово! Теперь можно логиниться через Supabase (приглашения) и работать с демо-данными.');
}

main().catch((error) => {
  console.error('❌ Ошибка при сидировании:', error);
  process.exit(1);
});
