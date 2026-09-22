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
  throw new Error('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — set these in Vercel environment variables');
}

// Admin client — service role, used server-side only, NEVER exposed to browser
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Single owner of this personal app — used when no JWT and no env override
const OWNER_USER_ID = process.env.SUPABASE_DEV_USER_ID || '246112b2-7020-4b8c-a201-fd7c517c6c05';

// Extract user_id from request
// In production: parse JWT from Authorization header
// Fallback: use OWNER_USER_ID (personal single-user app)
export async function getUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw Object.assign(new Error('Invalid or expired token'), { status: 401 });
    return user.id;
  }

  return OWNER_USER_ID;
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
