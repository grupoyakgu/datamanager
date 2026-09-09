# Supabase Setup Guide

## Step 1: Environment variables

`.env.local` needs:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

See `.env.example` for the full list.

## Step 2: Run database migrations

Apply, in order:

1. `migrations/001_initial_schema.sql`
2. `migrations/002_knowledge_hub.sql`

### Option A: Supabase SQL Editor

1. Open the project at https://app.supabase.com → **SQL Editor** → **New query**.
2. Paste the migration and click **Run**.

### Option B: psql

```bash
psql "postgresql://postgres:PASSWORD@db.<project-ref>.supabase.co:5432/postgres" < migrations/001_initial_schema.sql
psql "postgresql://postgres:PASSWORD@db.<project-ref>.supabase.co:5432/postgres" < migrations/002_knowledge_hub.sql
```

Migration 002 enables the `vector` extension, creates the auth trigger that
mirrors `auth.users` into `public.users`, and seeds `app_settings`
(admin emails, subject keywords, completeness weights).

## Step 3: Admin access

The trigger grants the `admin` role to any email listed in the
`admin_emails` setting (default: `koby@grupoyakgu.es`). Admins can edit the
list from **Admin → System**.

## Step 4: Google provider

See `GOOGLE_SETUP.md` for enabling Google sign-in with Gmail and Drive scopes.

## Step 5: Verify

```bash
npm run dev
```

Visit http://localhost:3000 - you should be redirected to the login page.

## Troubleshooting

- **"Invalid API key"**: verify credentials in `.env.local`.
- **"SUPABASE_SERVICE_ROLE_KEY ... must be set"**: the API routes need the service role key on the server.
- **User signs in but has no profile**: check the `on_auth_user_created` trigger exists on `auth.users` (migration 002).
