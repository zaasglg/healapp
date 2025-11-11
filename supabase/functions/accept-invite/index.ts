/// <reference types="https://deno.land/std@0.224.0/types.d.ts" />

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
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
};

type InviteRecord = {
  id: string;
  token: string;
  invite_type: InviteType;
  expires_at: string | null;
  used_at: string | null;
  revoked_at: string | null;
  metadata: Record<string, unknown> | null;
  organization_invite_tokens?: {
    organization_id: string;
    organization_type: "pension" | "patronage_agency" | "caregiver";
    employee_role: "admin" | "manager" | "doctor" | "caregiver";
  } | null;
  caregiver_client_invite_tokens?: {
    caregiver_id: string;
    invited_client_phone: string | null;
    invited_client_name: string | null;
  } | null;
  organization_client_invite_tokens?: {
    organization_id: string;
    patient_card_id: string;
    diary_id: string | null;
    invited_client_phone: string | null;
    invited_client_name: string | null;
  } | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
       organization_invite_tokens!inner(organization_id, organization_type, employee_role),
       organization_client_invite_tokens!left(organization_id, patient_card_id, diary_id, invited_client_phone, invited_client_name),
       caregiver_client_invite_tokens!left(caregiver_id, invited_client_phone, invited_client_name)`
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
  const { data, error } = await client.auth.signInWithPassword(credentials as never);
  if (error) throw error;
  return data.session;
}

async function handleOrganizationEmployee(
  client: SupabaseClient,
  invite: InviteRecord,
  payload: Required<Pick<AcceptInviteRequest, "password" | "firstName" | "lastName" | "phone">>
): Promise<HandlerResult> {
  const meta = invite.organization_invite_tokens;
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
      metadata: { source_invite: invite.token },
    }),
    client.from("organization_employees").insert({
      user_id: user.id,
      organization_id: meta.organization_id,
      role: meta.employee_role,
      phone: normalizedPhone,
      first_name: payload.firstName,
      last_name: payload.lastName,
    }),
  ];

  for (const op of inserts) {
    const { error } = await op;
    if (error) throw error;
  }

  await markInviteUsed(client, invite.id, user.id);

  return {
    userId: user.id,
    role: "org_employee",
    organizationId: meta.organization_id,
    loginPhone: normalizedPhone,
  };
}

async function handleOrganizationClient(
  client: SupabaseClient,
  invite: InviteRecord,
  payload: Required<Pick<AcceptInviteRequest, "password" | "firstName" | "lastName">> & { phone?: string }
): Promise<HandlerResult> {
  const meta = invite.organization_client_invite_tokens;
  if (!meta) {
    throw new Response("Invite metadata missing", { status: 400 });
  }

  const phoneRaw = payload.phone ?? meta.invited_client_phone ?? undefined;
  if (!phoneRaw) {
    throw new Response("phone is required for client invite", { status: 400 });
  }
  const phone = normalizePhone(phoneRaw);
  const pseudoEmail = phone
    ? buildPseudoEmail(phone, "organization_client")
    : `${crypto.randomUUID()}@client.diary.local`;

  const user = await createAuthUser(client, {
    email: payload.email ?? pseudoEmail,
    password: payload.password,
    phone,
    userMetadata: {
      invite_token: invite.token,
      organization_id: meta.organization_id,
      role: "client",
      phone,
    },
  });

  const clientInsert = await client
    .from("clients")
    .insert({
      user_id: user.id,
      invited_by_organization_id: meta.organization_id,
      phone,
      first_name: payload.firstName,
      last_name: payload.lastName,
    })
    .select("id")
    .single();
  if (clientInsert.error) throw clientInsert.error;

  const clientId = clientInsert.data.id;

  const updates = [
    client.from("user_profiles").insert({
      user_id: user.id,
      role: "client",
      client_id: clientId,
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
  }

  for (const op of updates) {
    const { error } = await op;
    if (error && error.code !== "PGRST116") {
      // PGRST116: no rows updated (например, если diary_id=null) — игнорируем
      throw error;
    }
  }

  await markInviteUsed(client, invite.id, user.id);

  return {
    userId: user.id,
    role: "client",
    clientId,
    loginPhone: phone,
  };
}

async function handleCaregiverClient(
  client: SupabaseClient,
  invite: InviteRecord,
  payload: Required<Pick<AcceptInviteRequest, "password" | "firstName" | "lastName">> & { phone?: string }
): Promise<HandlerResult> {
  const meta = invite.caregiver_client_invite_tokens;
  if (!meta) {
    throw new Response("Invite metadata missing", { status: 400 });
  }

  const phoneRaw = payload.phone ?? meta.invited_client_phone ?? undefined;
  if (!phoneRaw) {
    throw new Response("phone is required for client invite", { status: 400 });
  }
  const phone = normalizePhone(phoneRaw);
  const pseudoEmail = buildPseudoEmail(phone, "caregiver_client");

  const user = await createAuthUser(client, {
    email: payload.email ?? pseudoEmail,
    password: payload.password,
    phone,
    userMetadata: {
      invite_token: invite.token,
      caregiver_id: meta.caregiver_id,
      role: "client",
      phone,
    },
  });

  const clientInsert = await client
    .from("clients")
    .insert({
      user_id: user.id,
      invited_by_caregiver_id: meta.caregiver_id,
      phone,
      first_name: payload.firstName,
      last_name: payload.lastName,
    })
    .select("id")
    .single();
  if (clientInsert.error) throw clientInsert.error;

  const clientId = clientInsert.data.id;

  const { error: profileError } = await client.from("user_profiles").insert({
    user_id: user.id,
    role: "client",
    client_id: clientId,
    metadata: { source_invite: invite.token },
  });
  if (profileError) throw profileError;

  await markInviteUsed(client, invite.id, user.id);

  return {
    userId: user.id,
    role: "client",
    clientId,
    loginPhone: phone,
  };
}

async function acceptInviteHandler(client: SupabaseClient, payload: AcceptInviteRequest): Promise<HandlerResult> {
  const { token, password, firstName, lastName } = payload;
  if (!token || !password) {
    throw new Response("token and password are required", { status: 400 });
  }
  if (!firstName || !lastName) {
    throw new Response("firstName and lastName are required", { status: 400 });
  }

  const invite = await fetchInvite(client, token);
  ensureInviteUsable(invite);

  switch (invite.invite_type) {
    case "organization_employee": {
      const phone = payload.phone ?? invite.metadata?.["phone"]?.toString();
      if (!phone) {
        throw new Response("phone is required for employee invite", { status: 400 });
      }
      return await handleOrganizationEmployee(client, invite, {
        password,
        firstName,
        lastName,
        phone,
      });
    }
    case "organization_client": {
      return await handleOrganizationClient(client, invite, {
        password,
        firstName,
        lastName,
        phone: payload.phone,
        email: payload.email,
      });
    }
    case "caregiver_client": {
      return await handleCaregiverClient(client, invite, {
        password,
        firstName,
        lastName,
        phone: payload.phone,
        email: payload.email,
      });
    }
    default:
      throw new Response("Unsupported invite type", { status: 400 });
  }
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
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

    const payload = (await req.json()) as AcceptInviteRequest;
    const result = await acceptInviteHandler(client, payload);

    const session = await createSession(client, {
      phone: result.loginPhone,
      password: payload.password!,
    });

    const { loginPhone, ...sanitized } = result;

    return jsonResponse({
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
      return error;
    }
    console.error("accept-invite error", error);
    const body: ErrorBody = {
      message: error instanceof Error ? error.message : "Unexpected error",
    };
    return jsonResponse(body, { status: 500 });
  }
});
