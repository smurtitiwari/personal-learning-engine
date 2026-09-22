# Learning Engine

## Google sign-in

The production app uses Supabase Auth and stores resources, goals, progress, preferences, and AI conversations under the signed-in user ID.

Before the first production login, enable **Google** in Supabase Dashboard → Authentication → Providers, then add this redirect URL in Authentication → URL Configuration:

`https://learning-engine-opal.vercel.app/api/auth/callback`

Set `REQUIRE_AUTH=true` and `APP_URL=https://learning-engine-opal.vercel.app` in Vercel. The server-side `SUPABASE_SERVICE_ROLE_KEY` remains private; it is never sent to the browser.
