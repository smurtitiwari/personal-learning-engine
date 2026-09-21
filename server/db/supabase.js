// ============================================================
// Supabase client for Express server
// Replaces the SQLite db.js
// ============================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Admin client — service role, used server-side only, NEVER exposed to browser
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Extract user_id from request
// In production: parse JWT from Authorization header
// In dev (no auth header): use SUPABASE_DEV_USER_ID env var
export async function getUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw Object.assign(new Error('Invalid or expired token'), { status: 401 });
    return user.id;
  }

  // Dev fallback
  const devUserId = process.env.SUPABASE_DEV_USER_ID;
  if (devUserId) return devUserId;

  throw Object.assign(new Error('Authentication required'), { status: 401 });
}

// Invoke a Supabase Edge Function from the Express server
export async function invokeFunction(functionName, payload, userToken) {
  const fnUrl = `${supabaseUrl}/functions/v1/${functionName}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': userToken
      ? `Bearer ${userToken}`
      : `Bearer ${supabaseServiceKey}`,
    'apikey': supabaseServiceKey,
  };
  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw Object.assign(new Error(`Edge function ${functionName} failed: ${text}`), { status: resp.status });
  }
  return resp.json();
}
