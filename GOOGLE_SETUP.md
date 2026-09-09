# Google Sign-in, Gmail and Drive Setup

The app signs users in with Google through Supabase Auth and, in the same consent
screen, asks for read-only Gmail, Gmail send and read-only Drive access. The
refresh token Google returns is stored server-side (`google_connections` table)
so the hourly sync can read each user's mailbox.

## 1. Google Cloud project

1. Open https://console.cloud.google.com and create or select a project.
2. **APIs & Services → Library**: enable **Gmail API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: *Internal* (Google Workspace) so no verification is needed.
   - Add scopes:
     - `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send` (only needed for *Send by Email*)
     - `https://www.googleapis.com/auth/drive.readonly`
4. **Credentials → Create credentials → OAuth client ID** (Web application):
   - Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client secret**.

## 2. Supabase

1. **Authentication → Providers → Google**: enable it and paste the Client ID and secret.
2. **Authentication → URL Configuration**: add your app URLs to *Redirect URLs*
   (`http://localhost:3000/auth/callback`, `https://<your-domain>/auth/callback`).
3. Run the migrations in `migrations/` (001 then 002) if they are not applied yet.

## 3. Environment variables

Add to `.env.local` (and to Vercel project settings):

```
GOOGLE_CLIENT_ID=<same client id>
GOOGLE_CLIENT_SECRET=<same client secret>
OPENAI_API_KEY=<key>
CRON_SECRET=<random string>
```

The client id and secret are required server-side to refresh Google access
tokens; without them the Gmail sync and Drive browser return
"authorization required".

## 4. How the flow works

- Login requests `access_type=offline` and `prompt=consent`, so Google returns a
  refresh token on every sign-in.
- `/auth/callback` posts the provider tokens to `/api/auth/google-tokens`, which
  stores them and marks the user as *Connected*.
- The hourly Vercel cron (`vercel.json`) calls `/api/cron/sync` with the
  `CRON_SECRET`; admins can also trigger *Sync now* from the Admin → Gmail tab.
- If Google revokes the token (user removed access), the sync marks the user
  as **Gmail Authorization Required**; signing in again reconnects.

## Removing the send scope

If you prefer strictly read-only access, remove `gmail.send` from
`GOOGLE_SCOPES` in `app/login/page.tsx` and `lib/google/oauth.ts`. The
*Send by Email* button will then return an authorization error.
