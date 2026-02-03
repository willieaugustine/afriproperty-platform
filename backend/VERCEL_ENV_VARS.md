# Vercel environment variables for backend

Set the following environment variables in your Vercel project (Project Settings → Environment Variables) before deploying the backend.

- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (keep secret)
- `SUPABASE_ANON_KEY` — anon/public key (optional for some flows)
- `FRONTEND_URL` — frontend origin (e.g. https://your-app.vercel.app)
- `NODE_ENV` — set to `production`
- `PORT` — not required on Vercel

Also add third-party keys used by the backend (SendGrid, M-Pesa, Smile, etc.) as documented in `backend/.env.example`.
