import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function corsResponse(body: any, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...(init.headers || {}),
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const inviteId: string | undefined = body.invite_id
    const adminToken: string | undefined = body.admin_token

    if (!inviteId) {
      return corsResponse({ error: 'Не указан invite_id' }, { status: 400 })
    }
    if (!adminToken) {
      return corsResponse({ error: 'Отсутствует админский токен' }, { status: 401 })
    }

    const allowedTokensEnv = Deno.env.get('ADMIN_TOKENS') || Deno.env.get('VITE_ADMIN_TOKENS') || ''
    const allowedTokens = allowedTokensEnv
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const fallbackToken = 'b8f56f5c-62f1-45d9-9e5a-e8bbfdadcf0f'
    if (!allowedTokens.includes(adminToken) && adminToken !== fallbackToken) {
      return corsResponse({ error: 'Недостаточно прав' }, { status: 403 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !supabaseServiceKey) {
      return corsResponse({ error: 'Не настроены переменные окружения Supabase' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Удаляем приглашение; внешние таблицы связаны по FK ON DELETE CASCADE
    const { error } = await supabase.from('invite_tokens').delete().eq('id', inviteId)
    if (error) {
      console.error('Ошибка удаления invite_tokens:', error)
      return corsResponse({ error: error.message }, { status: 400 })
    }

    return corsResponse({ success: true })
  } catch (err: any) {
    console.error('Неожиданная ошибка admin-revoke-invite:', err)
    return corsResponse({ error: err?.message || 'Внутренняя ошибка' }, { status: 500 })
  }
})


