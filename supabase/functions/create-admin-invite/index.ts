// @ts-ignore - ESM import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type InviteType = "organization" | "private_caregiver" | "organization_client" | "caregiver_client" | "admin_static";

type CreateInviteRequest = {
  invite_type: InviteType;
  organization_type?: "pension" | "patronage_agency";
  expires_in_hours?: number;
  email?: string;
  name?: string;
  phone?: string;
  organization_id?: string;
  patient_card_id?: string;
  diary_id?: string;
  caregiver_id?: string;
};

// CORS заголовки
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-requested-with",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
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
    // Парсим тело запроса
    const body: CreateInviteRequest & { admin_token?: string } = await req.json();

    // Проверяем админский токен
    const adminToken = body.admin_token;
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

    // Создаем клиент с service role для выполнения операций
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    if (!body.invite_type) {
      return corsResponse(
        { error: "Не указан тип приглашения" },
        { status: 400 }
      );
    }

    // Подготавливаем payload для функции
    const payload: any = {
      expires_in_hours: body.expires_in_hours || 168, // 7 дней по умолчанию
      metadata: {},
    };

    if (body.email) payload.email = body.email;
    if (body.name) payload.name = body.name;
    if (body.phone) payload.phone = body.phone;
    if (body.organization_id) payload.organization_id = body.organization_id;
    if (body.patient_card_id) payload.patient_card_id = body.patient_card_id;
    if (body.diary_id) payload.diary_id = body.diary_id;
    if (body.caregiver_id) payload.caregiver_id = body.caregiver_id;

    if (body.invite_type === "organization") {
      payload.organization_type = body.organization_type || "pension";
    }

    // Вызываем функцию создания приглашения
    const { data, error } = await supabase.rpc("generate_admin_invite_link", {
      invite_type: body.invite_type,
      payload,
    });

    if (error) {
      console.error("Ошибка создания приглашения:", error);
      return corsResponse(
        { error: error.message, details: error },
        { status: 400 }
      );
    }

    if (!data) {
      return corsResponse(
        { error: "Не удалось создать приглашение" },
        { status: 500 }
      );
    }

    // Формируем ссылку
    const origin = req.headers.get("Origin") || req.headers.get("Referer") || "";
    const baseUrl = origin.replace(/\/$/, "") || "http://localhost:5173";
    
    let link = "";
    switch (body.invite_type) {
      case "organization":
      case "private_caregiver":
        link = `${baseUrl}/register?token=${data.token}`;
        break;
      case "organization_client":
      case "caregiver_client":
        link = `${baseUrl}/client-invite?token=${data.token}`;
        break;
      case "admin_static":
        // Явно помечаем ссылку параметром type=admin, чтобы фронт не путал флоу
        link = `${baseUrl}/client-invite?token=${data.token}&type=admin`;
        break;
    }

    return corsResponse({
      success: true,
      invite: data,
      link,
    });
  } catch (error: any) {
    console.error("Неожиданная ошибка:", error);
    return corsResponse(
      { error: error.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
});

