import { Router } from 'express';
import { supabase, getSessionUser, REQUIRE_AUTH } from '../db/supabase.js';

const router = Router();

function appOrigin(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return process.env.APP_URL || `${protocol}://${host}`;
}

router.get('/session', async (req, res) => {
  try {
    const user = await getSessionUser(req);
    res.json({
      data: {
        require_auth: REQUIRE_AUTH,
        user: user ? {
          id: user.id,
          email: user.email || '',
          name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Learner',
        } : null,
      },
    });
  } catch {
    res.json({ data: { require_auth: REQUIRE_AUTH, user: null } });
  }
});

router.get('/google', async (req, res, next) => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${appOrigin(req)}/api/auth/callback` },
    });
    if (error || !data?.url) throw error || new Error('Google sign-in is unavailable');
    res.redirect(302, data.url);
  } catch (error) { next(error); }
});

router.get('/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    if (!code) return res.redirect('/?auth_error=missing_code#learning');
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) return res.redirect('/?auth_error=google_signin_failed#learning');
    res.cookie('le_session', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1',
      sameSite: 'lax',
      maxAge: Math.max(60_000, (data.session.expires_in || 3600) * 1000),
      path: '/',
    });
    res.redirect('/?welcome=1#learning');
  } catch (error) { next(error); }
});

router.post('/signout', (_req, res) => {
  res.clearCookie('le_session', { path: '/' });
  res.status(204).end();
});

export default router;
