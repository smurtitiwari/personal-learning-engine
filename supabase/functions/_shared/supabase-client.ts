// ============================================================
// Supabase admin client for use inside Edge Functions
// Uses SERVICE_ROLE_KEY — never expose to browser
// ============================================================
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// Single owner of this personal app — fallback when no real JWT is present
const OWNER_USER_ID = Deno.env.get('SUPABASE_DEV_USER_ID') ?? '246112b2-7020-4b8c-a201-fd7c517c6c05';

// Extract user_id from JWT in Authorization header.
// Falls back to OWNER_USER_ID for server-to-server calls (service role key) or missing auth.
export async function getUserId(req: Request): Promise<string> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return OWNER_USER_ID;

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase credentials not set');

  // If the token is the service role key itself (server-to-server call), skip user lookup
  if (token === key) return OWNER_USER_ID;

  // Verify token against Supabase
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return OWNER_USER_ID;
  return user.id;
}

// Standard JSON response helpers
export function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};
