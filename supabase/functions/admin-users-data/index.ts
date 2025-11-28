// @ts-ignore - ESM import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS заголовки
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-requested-with",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Credentials": "true",
};

function corsResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

Deno.serve(async (req: Request) => {
  // Обработка preflight CORS запроса
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Проверяем админский токен
    const url = new URL(req.url);
    const adminToken = url.searchParams.get("admin_token") || (await req.json().catch(() => ({}))).admin_token;

    if (!adminToken) {
      return corsResponse(
        { error: "Отсутствует админский токен" },
        { status: 401 }
      );
    }

    // Получаем список разрешенных токенов из переменных окружения
    const allowedTokensEnv = Deno.env.get("ADMIN_TOKENS") || Deno.env.get("VITE_ADMIN_TOKENS") || "";
    const allowedTokens = allowedTokensEnv
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    // Добавляем дефолтный токен для разработки
    const fallbackToken = "b8f56f5c-62f1-45d9-9e5a-e8bbfdadcf0f";
    if (!allowedTokens.includes(adminToken) && adminToken !== fallbackToken) {
      return corsResponse(
        { error: "Недействительный админский токен" },
        { status: 403 }
      );
    }

    // Создаем клиент с service role для выполнения операций
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return corsResponse(
        { error: "Не настроены переменные окружения Supabase" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Загружаем все данные параллельно
    const [orgsResult, profilesResult, clientsResult, diariesResult, cardsResult, accessResult, authUsersResult] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at', { ascending: false }),
      supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('diaries').select('*').order('created_at', { ascending: false }),
      supabase.from('patient_cards').select('*').order('created_at', { ascending: false }),
      supabase.from('diary_employee_access').select('*'),
      // Загружаем пользователей из auth.users для получения email
      supabase.auth.admin.listUsers(),
    ]);

    // Проверяем ошибки
    if (orgsResult.error) {
      console.error('Ошибка загрузки organizations:', orgsResult.error);
    }
    if (profilesResult.error) {
      console.error('Ошибка загрузки user_profiles:', profilesResult.error);
    }
    if (clientsResult.error) {
      console.error('Ошибка загрузки clients:', clientsResult.error);
    }
    if (diariesResult.error) {
      console.error('Ошибка загрузки diaries:', diariesResult.error);
    }
    if (cardsResult.error) {
      console.error('Ошибка загрузки patient_cards:', cardsResult.error);
    }
    if (accessResult.error) {
      console.error('Ошибка загрузки diary_employee_access:', accessResult.error);
    }
    if (authUsersResult.error) {
      console.error('Ошибка загрузки auth.users:', authUsersResult.error);
    }

    // Создаем мапу email по user_id
    const emailMap = new Map<string, string>();
    if (authUsersResult.data?.users) {
      authUsersResult.data.users.forEach((user: any) => {
        if (user.email) {
          emailMap.set(user.id, user.email);
        }
      });
    }

    // Обогащаем данные email из auth.users
    const enrichedOrganizations = (orgsResult.data || []).map((org: any) => ({
      ...org,
      email: emailMap.get(org.user_id) || org.email || null,
    }));

    const enrichedUserProfiles = (profilesResult.data || []).map((profile: any) => ({
      ...profile,
      email: emailMap.get(profile.user_id) || profile.email || null,
    }));

    const enrichedClients = (clientsResult.data || []).map((client: any) => ({
      ...client,
      email: emailMap.get(client.user_id) || client.email || null,
    }));

    return corsResponse({
      success: true,
      data: {
        organizations: enrichedOrganizations,
        userProfiles: enrichedUserProfiles,
        clients: enrichedClients,
        diaries: diariesResult.data || [],
        patientCards: cardsResult.data || [],
        diaryEmployeeAccess: accessResult.data || [],
      },
    });
  } catch (error: any) {
    console.error("Неожиданная ошибка:", error);
    return corsResponse(
      { error: error.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
});

