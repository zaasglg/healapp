import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('Required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function run() {
  const suffix = Date.now();
  const orgEmail = `org_e2e_${suffix}@example.com`;
  const orgPassword = 'OrgTest123!';
  const employeePhone = `+7999${suffix.toString().slice(-7)}`;

  console.log('1) Создание пользователя организации');
  const { data: orgUserData, error: createUserError } = await serviceClient.auth.admin.createUser({
    email: orgEmail,
    password: orgPassword,
    email_confirm: true,
  });
  const orgUser = orgUserData?.user;
  if (createUserError || !orgUser) {
    throw createUserError ?? new Error('Не создан пользователь организации');
  }

  const orgId = crypto.randomUUID();
  console.log('2) Создание организации и профиля');
  const inserts = [
    serviceClient.from('organizations').insert({
      id: orgId,
      user_id: orgUser.id,
      organization_type: 'patronage_agency',
      name: 'E2E Test Org',
      phone: '+79990000090',
      address: 'Москва, тестовая 1',
    }),
    serviceClient.from('user_profiles').insert({
      user_id: orgUser.id,
      role: 'organization',
      organization_id: orgId,
    }),
  ];
  for (const query of inserts) {
    const { error } = await query;
    if (error) throw error;
  }

  console.log('3) Авторизация организации и вызов RPC generate_invite_link');
  const { data: orgSession, error: signInError } = await anonClient.auth.signInWithPassword({
    email: orgEmail,
    password: orgPassword,
  });
  if (signInError || !orgSession?.session) {
    throw signInError ?? new Error('Не удалось авторизоваться как организация');
  }

  const orgScopedClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  await orgScopedClient.auth.setSession(orgSession.session);

  const { data: inviteRow, error: rpcError } = await orgScopedClient.rpc('generate_invite_link', {
    invite_type: 'organization_employee',
    payload: {
      employee_role: 'caregiver',
      phone: employeePhone,
      expires_in_hours: 4,
    },
  });
  if (rpcError || !inviteRow) {
    throw rpcError ?? new Error('RPC generate_invite_link вернул пустой ответ');
  }
  console.log('   Получен токен:', inviteRow.token);

  console.log('4) Регистрация сотрудника через Edge Function accept-invite');
  const response = await fetch(`${supabaseUrl}/functions/v1/accept-invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      token: inviteRow.token,
      phone: employeePhone,
      password: 'Employee123!',
      firstName: 'Иван',
      lastName: 'Работник',
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Edge Function error ${response.status}: ${errorBody}`);
  }
  const acceptPayload = await response.json();
  if (!acceptPayload?.success) {
    throw new Error(`Edge Function вернула неожиданный ответ: ${JSON.stringify(acceptPayload)}`);
  }
  const employeeUserId: string = acceptPayload.data.userId;
  console.log('   Сотрудник создан:', employeeUserId);

  console.log('5) Проверка записей в organization_employees и user_profiles');
  const { data: employeeCheck, error: employeeCheckError } = await serviceClient
    .from('organization_employees')
    .select('id, user_id, organization_id, role')
    .eq('user_id', employeeUserId)
    .single();
  if (employeeCheckError || !employeeCheck) {
    throw employeeCheckError ?? new Error('Сотрудник не найден в organization_employees');
  }
  console.log('   Найдена запись сотрудника:', employeeCheck.id);

  console.log('6) Проверка, что токен помечен как использованный');
  const { data: inviteStatus, error: inviteStatusError } = await serviceClient
    .from('invite_tokens')
    .select('used_at, used_by')
    .eq('id', inviteRow.id)
    .single();
  if (inviteStatusError || !inviteStatus?.used_at) {
    throw inviteStatusError ?? new Error('Токен не помечен использованным');
  }

  console.log('7) Успешно. Выполняем очистку...');
  // Cleanup: remove employee, organization, users
  const cleanup = [
    serviceClient.from('organization_employees').delete().eq('user_id', employeeUserId),
    serviceClient.from('user_profiles').delete().eq('user_id', employeeUserId),
    serviceClient.auth.admin.deleteUser(employeeUserId),
    serviceClient.from('invite_tokens').delete().eq('id', inviteRow.id),
    serviceClient.from('user_profiles').delete().eq('user_id', orgUser.id),
    serviceClient.from('organizations').delete().eq('id', orgId),
    serviceClient.auth.admin.deleteUser(orgUser.id),
  ];
  for (const query of cleanup) {
    const { error } = await query;
    if (error) console.warn('Cleanup error:', error.message);
  }

  console.log('E2E сценарий приглашения успешно выполнен.');
}

run().catch((error) => {
  console.error('❌ E2E invite flow failed:', error);
  process.exit(1);
});
