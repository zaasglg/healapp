// @ts-ignore - ESM import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type InviteType = "organization_employee" | "organization_client" | "caregiver_client" | "admin_static";

type AcceptInviteRequest = {
  token?: string;
  password?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
};

type SupabaseClient = ReturnType<typeof createClient>;

type HandlerResult = {
  userId: string;
  role: "org_employee" | "client";
  organizationId?: string;
  clientId?: string;
  loginPhone: string;
  loginEmail: string; // Email для входа (псевдо-email)
};

type OrganizationInviteToken = {
  organization_id: string;
  organization_type: "pension" | "patronage_agency" | "caregiver";
  employee_role: "admin" | "manager" | "doctor" | "caregiver";
};

type CaregiverClientInviteToken = {
  caregiver_id: string;
  invited_client_phone: string | null;
  invited_client_name: string | null;
};

type OrganizationClientInviteToken = {
  organization_id: string;
  patient_card_id: string;
  diary_id: string | null;
  invited_client_phone: string | null;
  invited_client_name: string | null;
};

type InviteRecord = {
  id: string;
  token: string;
  invite_type: InviteType;
  expires_at: string | null;
  used_at: string | null;
  revoked_at: string | null;
  metadata: Record<string, unknown> | null;
  organization_invite_tokens?: OrganizationInviteToken | OrganizationInviteToken[] | null;
  caregiver_client_invite_tokens?: CaregiverClientInviteToken | CaregiverClientInviteToken[] | null;
  organization_client_invite_tokens?: OrganizationClientInviteToken | OrganizationClientInviteToken[] | null;
};

// @ts-ignore - Deno global
// В облачном Supabase эти переменные доступны автоматически
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("SUPABASE_PROJECT_URL");
// @ts-ignore - Deno global
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY");

type ErrorBody = { message: string; code?: string };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, "").replace(/^(?!\+)/, "+");
}

function buildPseudoEmail(phone: string, role: InviteType): string {
  const sanitized = phone.replace(/[^0-9]/g, "");
  return `${role}-${sanitized}@diary.local`; // псевдо-email для Supabase Auth
}

async function fetchInvite(client: SupabaseClient, token: string): Promise<InviteRecord> {
  const { data, error } = await client
    .from("invite_tokens")
    .select(
      `id, token, invite_type, expires_at, used_at, revoked_at, metadata,
       organization_invite_tokens(organization_id, organization_type, employee_role),
       organization_client_invite_tokens(organization_id, patient_card_id, diary_id, invited_client_phone, invited_client_name),
       caregiver_client_invite_tokens(caregiver_id, invited_client_phone, invited_client_name)`
    )
    .eq("token", token)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Response("Invite not found", { status: 404 });
  }
  return data as InviteRecord;
}

function ensureInviteUsable(invite: InviteRecord) {
  if (invite.used_at) {
    throw new Response("Invite already used", { status: 410 });
  }
  if (invite.revoked_at) {
    throw new Response("Invite revoked", { status: 410 });
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Response("Invite expired", { status: 410 });
  }
}

async function markInviteUsed(client: SupabaseClient, inviteId: string, userId: string) {
  const { error } = await client
    .from("invite_tokens")
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq("id", inviteId);
  if (error) throw error;
}

async function createAuthUser(
  client: SupabaseClient,
  params: {
    email: string;
    password: string;
    phone?: string;
    userMetadata?: Record<string, unknown>;
  }
) {
  const { data, error } = await client.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    phone: params.phone,
    phone_confirm: Boolean(params.phone),
    user_metadata: params.userMetadata ?? {},
  });
  if (error) throw error;
  return data.user;
}

async function createSession(
  client: SupabaseClient,
  credentials:
    | { phone: string; password: string }
    | { email: string; password: string }
) {
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error) throw error;
  return data?.session ?? null;
}

async function handleOrganizationEmployee(
  client: SupabaseClient,
  invite: InviteRecord,
  payload: Required<Pick<AcceptInviteRequest, "password" | "phone">> & {
    firstName?: string;
    lastName?: string;
  }
): Promise<HandlerResult> {
  const metaRaw = invite.organization_invite_tokens;
  const meta = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw;
  if (!meta) {
    throw new Response("Invite metadata missing", { status: 400 });
  }

  const normalizedPhone = normalizePhone(payload.phone);
  const pseudoEmail = normalizedPhone
    ? buildPseudoEmail(normalizedPhone, "organization_employee")
    : `${crypto.randomUUID()}@employee.diary.local`;

  const user = await createAuthUser(client, {
    email: pseudoEmail,
    password: payload.password,
    phone: normalizedPhone,
    userMetadata: {
      invite_token: invite.token,
      organization_id: meta.organization_id,
      role: "org_employee",
      phone: normalizedPhone,
    },
  });

  const inserts = [
    client.from("user_profiles").insert({
      user_id: user.id,
      role: "org_employee",
      organization_id: meta.organization_id,
      phone_e164: normalizedPhone, // Сохраняем телефон в user_profiles
      metadata: { source_invite: invite.token },
    }),
    client.from("organization_employees").insert({
      user_id: user.id,
      organization_id: meta.organization_id,
      role: meta.employee_role,
      phone: normalizedPhone,
      first_name: payload.firstName || "",
      last_name: payload.lastName || "",
    }),
  ];

  for (const op of inserts) {
    const { error } = await op;
    if (error) throw error;
  }

  // Обновляем organization_invite_tokens с данными зарегистрированного сотрудника
  const invitedName = [payload.firstName, payload.lastName].filter(Boolean).join(" ") || null;
  const { error: updateInviteTokenError } = await client
    .from("organization_invite_tokens")
    .update({
      invited_phone: normalizedPhone,
      invited_email: pseudoEmail,
      invited_name: invitedName,
      metadata: {
        registered_at: new Date().toISOString(),
        user_id: user.id,
      },
    })
    .eq("invite_id", invite.id);

  if (updateInviteTokenError) {
    console.error("Error updating organization_invite_tokens:", updateInviteTokenError);
    // Не прерываем выполнение, так как это не критично
  }

  await markInviteUsed(client, invite.id, user.id);

  return {
    userId: user.id,
    role: "org_employee",
    organizationId: meta.organization_id,
    loginPhone: normalizedPhone,
    loginEmail: pseudoEmail, // Сохраняем email для входа
  };
}

async function handleOrganizationClient(
  client: SupabaseClient,
  invite: InviteRecord,
  payload: Required<Pick<AcceptInviteRequest, "password" | "phone">> & { email?: string; firstName?: string; lastName?: string }
): Promise<HandlerResult> {
  const metaRaw = invite.organization_client_invite_tokens;
  const meta = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw;
  if (!meta) {
    throw new Response("Invite metadata missing", { status: 400 });
  }

  const normalizedPhone = normalizePhone(payload.phone);
  const pseudoEmail = normalizedPhone
    ? buildPseudoEmail(normalizedPhone, "organization_client")
    : `${crypto.randomUUID()}@client.diary.local`;
  
  // Используем переданный email или псевдо-email
  const finalEmail = payload.email ?? pseudoEmail;

  const user = await createAuthUser(client, {
    email: finalEmail,
    password: payload.password,
    phone: normalizedPhone,
    userMetadata: {
      invite_token: invite.token,
      organization_id: meta.organization_id,
      role: "client",
      phone: normalizedPhone,
    },
  });

  console.log("Processing client registration for organization:", {
    user_id: user.id,
    organization_id: meta.organization_id,
    phone: normalizedPhone,
    first_name: payload.firstName || "",
    last_name: payload.lastName || "",
    patient_card_id: meta.patient_card_id,
  });
  
  // Создаем клиента для организации
  // Организация создает карточку БЕЗ client_id (client_id = null)
  // При регистрации клиента создаем нового клиента и обновляем client_id в карточке
  const clientInsert = await client
    .from("clients")
    .insert({
      user_id: user.id,
      invited_by_organization_id: meta.organization_id,
      phone: normalizedPhone,
      first_name: payload.firstName || "",
      last_name: payload.lastName || "",
    })
    .select("id")
    .single();
  
  if (clientInsert.error) {
    console.error("Error creating client:", clientInsert.error);
    throw clientInsert.error;
  }
  
  console.log("✅ Client created successfully:", clientInsert.data.id);
  const clientId = clientInsert.data.id;

  const updates = [
    client.from("user_profiles").insert({
      user_id: user.id,
      role: "client",
      client_id: clientId,
      phone_e164: normalizedPhone, // Сохраняем телефон в user_profiles
      metadata: { source_invite: invite.token },
    }),
    client
      .from("patient_cards")
      .update({ client_id: clientId })
      .eq("id", meta.patient_card_id),
  ];

  if (meta.diary_id) {
    updates.push(
      client
        .from("diaries")
        .update({ owner_client_id: clientId })
        .eq("id", meta.diary_id)
    );
    
    // Обновляем diary_client_links при регистрации клиента
    // Используем upsert, чтобы создать запись, если её нет, или обновить существующую
    console.log("Updating diary_client_links:", {
      diary_id: meta.diary_id,
      client_id: clientId,
      accepted_by: user.id,
      token: invite.token,
    });
    
    const diaryClientLinkUpdate = client
      .from("diary_client_links")
      .upsert({
        diary_id: meta.diary_id,
        client_id: clientId,
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
        token: invite.token, // Сохраняем токен для совместимости
      }, {
        onConflict: 'diary_id',
      });
    
    updates.push(diaryClientLinkUpdate);
  }

  // Выполняем обновления последовательно, чтобы видеть ошибки для каждого
  for (let i = 0; i < updates.length; i++) {
    const op = updates[i];
    try {
      const { error, data } = await op;
      if (error) {
        // Логируем все ошибки для отладки
        console.error(`Error in update operation ${i}:`, error);
        console.error("Error details:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        
        if (error.code !== "PGRST116") {
          // PGRST116: no rows updated (например, если diary_id=null) — игнорируем
          // Но для diary_client_links это критично, поэтому логируем
          if (i === updates.length - 1 && meta.diary_id) {
            // Это последняя операция (diary_client_links), и она критична
            console.error("CRITICAL: Failed to update diary_client_links!");
            // Пытаемся обновить вручную через отдельный запрос
            try {
              const { error: manualError } = await client
                .from("diary_client_links")
                .upsert({
                  diary_id: meta.diary_id,
                  client_id: clientId,
                  accepted_by: user.id,
                  accepted_at: new Date().toISOString(),
                  token: invite.token,
                }, {
                  onConflict: 'diary_id',
                });
              
              if (manualError) {
                console.error("CRITICAL: Manual update of diary_client_links also failed:", manualError);
                // Не прерываем выполнение, но логируем критическую ошибку
              } else {
                console.log("✅ Successfully updated diary_client_links manually");
              }
            } catch (manualErr) {
              console.error("CRITICAL: Exception during manual diary_client_links update:", manualErr);
            }
          }
          // Для других операций пробрасываем ошибку
          throw error;
        } else {
          console.warn(`Ignoring PGRST116 error (no rows updated) for operation ${i}`);
        }
      } else {
        console.log(`Update operation ${i} succeeded`, data ? `(affected rows: ${Array.isArray(data) ? data.length : 1})` : '');
      }
    } catch (err) {
      console.error(`Exception in update operation ${i}:`, err);
      // Для критических операций пробрасываем ошибку
      if (i === updates.length - 1 && meta.diary_id) {
        // Это последняя операция (diary_client_links), но мы уже попытались обновить вручную
        // Продолжаем выполнение, так как owner_client_id уже обновлен
        console.warn("Continuing despite diary_client_links update error (owner_client_id already updated)");
      } else {
        throw err;
      }
    }
  }

  // Обновляем organization_client_invite_tokens с данными зарегистрированного клиента
  const invitedName = (payload.firstName && payload.lastName) 
    ? `${payload.firstName} ${payload.lastName}`.trim() 
    : null;
  
  console.log("Updating organization_client_invite_tokens:", {
    invite_id: invite.id,
    invited_client_phone: normalizedPhone,
    invited_client_name: invitedName,
    client_id: clientId,
    user_id: user.id,
  });
  
  // Обновляем organization_client_invite_tokens с данными зарегистрированного клиента
  // Используем upsert на случай, если запись не существует
  console.log("Attempting to update organization_client_invite_tokens for invite_id:", invite.id);
  const { data: updatedData, error: updateInviteTokenError } = await client
    .from("organization_client_invite_tokens")
    .update({
      invited_client_phone: normalizedPhone,
      invited_client_name: invitedName,
      metadata: {
        registered_at: new Date().toISOString(),
        user_id: user.id,
        client_id: clientId,
      },
    })
    .eq("invite_id", invite.id)
    .select();

  console.log("Update result:", { 
    hasError: !!updateInviteTokenError, 
    error: updateInviteTokenError,
    updatedCount: updatedData?.length || 0,
    updatedData 
  });

  // Если ошибка ИЛИ запись не найдена (0 строк обновлено), пытаемся вставить
  if (updateInviteTokenError || !updatedData || updatedData.length === 0) {
    if (updateInviteTokenError) {
      console.error("Error updating organization_client_invite_tokens:", updateInviteTokenError);
    } else {
      console.log("No rows updated, record may not exist. Attempting insert...");
    }
    
    console.log("Attempting to insert organization_client_invite_tokens record...");
    const { data: insertedData, error: insertError } = await client
      .from("organization_client_invite_tokens")
      .insert({
        invite_id: invite.id,
        invite_type: "organization_client",
        organization_id: meta.organization_id,
        patient_card_id: meta.patient_card_id,
        diary_id: meta.diary_id,
        invited_client_phone: normalizedPhone,
        invited_client_name: invitedName,
        metadata: {
          registered_at: new Date().toISOString(),
          user_id: user.id,
          client_id: clientId,
        },
      })
      .select();
    
    console.log("Insert result:", { 
      hasError: !!insertError, 
      error: insertError,
      insertedData 
    });
    
    if (insertError) {
      console.error("Error inserting organization_client_invite_tokens:", insertError);
    } else {
      console.log("✅ Successfully inserted organization_client_invite_tokens:", insertedData);
    }
  } else {
    console.log("✅ Successfully updated organization_client_invite_tokens:", updatedData);
  }

  await markInviteUsed(client, invite.id, user.id);

  return {
    userId: user.id,
    role: "client",
    clientId,
    loginPhone: normalizedPhone,
    loginEmail: finalEmail, // Сохраняем email для входа
  };
}

async function handleCaregiverClient(
  client: SupabaseClient,
  invite: InviteRecord,
  payload: Required<Pick<AcceptInviteRequest, "password" | "phone">> & { email?: string; firstName?: string; lastName?: string }
): Promise<HandlerResult> {
  const metaRaw = invite.caregiver_client_invite_tokens;
  const meta = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw;
  if (!meta) {
    throw new Response("Invite metadata missing", { status: 400 });
  }

  const normalizedPhone = normalizePhone(payload.phone);
  const pseudoEmail = normalizedPhone
    ? buildPseudoEmail(normalizedPhone, "caregiver_client")
    : `${crypto.randomUUID()}@client.diary.local`;
  
  // Используем переданный email или псевдо-email
  const finalEmail = payload.email ?? pseudoEmail;

  const user = await createAuthUser(client, {
    email: finalEmail,
    password: payload.password,
    phone: normalizedPhone,
    userMetadata: {
      invite_token: invite.token,
      caregiver_id: meta.caregiver_id,
      role: "client",
      phone: normalizedPhone,
    },
  });

  console.log("Creating client for caregiver:", {
    user_id: user.id,
    caregiver_id: meta.caregiver_id,
    phone: normalizedPhone,
    first_name: payload.firstName || "",
    last_name: payload.lastName || "",
  });
  
  const clientInsert = await client
    .from("clients")
    .insert({
      user_id: user.id,
      invited_by_caregiver_id: meta.caregiver_id,
      phone: normalizedPhone,
      first_name: payload.firstName || "",
      last_name: payload.lastName || "",
    })
    .select("id")
    .single();
  if (clientInsert.error) {
    console.error("Error creating client:", clientInsert.error);
    throw clientInsert.error;
  }
  
  console.log("✅ Client created successfully:", clientInsert.data.id);

  const clientId = clientInsert.data.id;

  const { error: profileError } = await client.from("user_profiles").insert({
    user_id: user.id,
    role: "client",
    client_id: clientId,
    phone_e164: normalizedPhone, // Сохраняем телефон в user_profiles
    metadata: { source_invite: invite.token },
  });
  if (profileError) throw profileError;

  // Обновляем caregiver_client_invite_tokens с данными зарегистрированного клиента
  const invitedName = (payload.firstName && payload.lastName) 
    ? `${payload.firstName} ${payload.lastName}`.trim() 
    : null;
  
  console.log("Updating caregiver_client_invite_tokens:", {
    invite_id: invite.id,
    invited_client_phone: normalizedPhone,
    invited_client_name: invitedName,
    client_id: clientId,
    user_id: user.id,
  });
  
  // Обновляем caregiver_client_invite_tokens с данными зарегистрированного клиента
  // Используем upsert на случай, если запись не существует
  console.log("Attempting to update caregiver_client_invite_tokens for invite_id:", invite.id);
  const { data: updatedData, error: updateInviteTokenError } = await client
    .from("caregiver_client_invite_tokens")
    .update({
      invited_client_phone: normalizedPhone,
      invited_client_name: invitedName,
      metadata: {
        registered_at: new Date().toISOString(),
        user_id: user.id,
        client_id: clientId,
      },
    })
    .eq("invite_id", invite.id)
    .select();

  console.log("Update result:", { 
    hasError: !!updateInviteTokenError, 
    error: updateInviteTokenError,
    updatedCount: updatedData?.length || 0,
    updatedData 
  });

  // Если ошибка ИЛИ запись не найдена (0 строк обновлено), пытаемся вставить
  if (updateInviteTokenError || !updatedData || updatedData.length === 0) {
    if (updateInviteTokenError) {
      console.error("Error updating caregiver_client_invite_tokens:", updateInviteTokenError);
    } else {
      console.log("No rows updated, record may not exist. Attempting insert...");
    }
    
    console.log("Attempting to insert caregiver_client_invite_tokens record...");
    const { data: insertedData, error: insertError } = await client
      .from("caregiver_client_invite_tokens")
      .insert({
        invite_id: invite.id,
        invite_type: "caregiver_client",
        caregiver_id: meta.caregiver_id,
        invited_client_phone: normalizedPhone,
        invited_client_name: invitedName,
        metadata: {
          registered_at: new Date().toISOString(),
          user_id: user.id,
          client_id: clientId,
        },
      })
      .select();
    
    console.log("Insert result:", { 
      hasError: !!insertError, 
      error: insertError,
      insertedData 
    });
    
    if (insertError) {
      console.error("Error inserting caregiver_client_invite_tokens:", insertError);
    } else {
      console.log("✅ Successfully inserted caregiver_client_invite_tokens:", insertedData);
    }
  } else {
    console.log("✅ Successfully updated caregiver_client_invite_tokens:", updatedData);
  }

  await markInviteUsed(client, invite.id, user.id);

  return {
    userId: user.id,
    role: "client",
    clientId,
    loginPhone: normalizedPhone,
    loginEmail: finalEmail, // Сохраняем email для входа
  };
}

async function acceptInviteHandler(client: SupabaseClient, payload: AcceptInviteRequest): Promise<HandlerResult> {
  const { token, password, firstName, lastName } = payload;
  if (!token || !password) {
    throw new Response("token and password are required", { status: 400 });
  }

  const invite = await fetchInvite(client, token);
  ensureInviteUsable(invite);

  switch (invite.invite_type) {
    case "organization_employee": {
      const phone = payload.phone ?? invite.metadata?.["phone"]?.toString();
      if (!phone) {
        throw new Response("phone is required for employee invite", { status: 400 });
      }
      // firstName и lastName опциональны для сотрудников (заполняются в ProfileSetupPage)
      return await handleOrganizationEmployee(client, invite, {
        password,
        phone,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });
    }
    case "organization_client": {
      // Для клиентов firstName и lastName опциональны (заполняются в ProfileSetupPage)
      const phone = payload.phone ?? invite.metadata?.["phone"]?.toString();
      if (!phone) {
        throw new Response("phone is required for client invite", { status: 400 });
      }
      return await handleOrganizationClient(client, invite, {
        password,
        phone,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: payload.email,
      });
    }
    case "caregiver_client": {
      // Для клиентов firstName и lastName опциональны (заполняются в ProfileSetupPage)
      const phone = payload.phone ?? invite.metadata?.["phone"]?.toString();
      if (!phone) {
        throw new Response("phone is required for client invite", { status: 400 });
      }
      return await handleCaregiverClient(client, invite, {
        password,
        phone,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: payload.email,
      });
    }
    default:
      throw new Response("Unsupported invite type", { status: 400 });
  }
}

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

// @ts-ignore - Deno global
Deno.serve(async (req: Request) => {
  // Логируем входящий запрос для отладки
  console.log(`[accept-invite] ${req.method} ${req.url}`);
  console.log(`[accept-invite] Headers:`, Object.fromEntries(req.headers.entries()));
  
  // Обработка preflight CORS запроса (должен быть первым)
  // Согласно документации Supabase, для OPTIONS нужно возвращать статус 200
  if (req.method === "OPTIONS") {
    console.log("[accept-invite] Handling OPTIONS preflight request");
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return corsResponse({ error: "Method Not Allowed" }, { status: 405 });
    }

    const client = createClient(
      requireEnv("SUPABASE_URL", SUPABASE_URL),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Парсим JSON с обработкой ошибок
    let payload: AcceptInviteRequest;
    try {
      payload = (await req.json()) as AcceptInviteRequest;
    } catch (jsonError) {
      console.error("JSON parse error:", jsonError);
      return corsResponse(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const result = await acceptInviteHandler(client, payload);

    // Используем email для входа, так как phone logins могут быть отключены
    const session = await createSession(client, {
      email: result.loginEmail,
      password: payload.password!,
    });

    // Убираем loginPhone и loginEmail из ответа (не нужны на фронтенде)
    const { loginPhone, loginEmail, ...sanitized } = result;

    return corsResponse({
      success: true,
      data: {
        ...sanitized,
        session: session
          ? {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              token_type: session.token_type,
              expires_in: session.expires_in,
              expires_at: session.expires_at,
            }
          : null,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      // Добавляем CORS заголовки к существующему Response
      const headers = new Headers(error.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
      return new Response(error.body, {
        status: error.status,
        statusText: error.statusText,
        headers,
      });
    }
    console.error("accept-invite error", error);
    const body: ErrorBody = {
      message: error instanceof Error ? error.message : "Unexpected error",
    };
    return corsResponse(body, { status: 500 });
  }
});
