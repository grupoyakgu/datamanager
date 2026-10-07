# Google Sign-in, Gmail and Drive Setup

The app signs users in with Google through Supabase Auth using only basic
profile scopes (`email`, `profile`) — granting Gmail/Drive access is **not**
required to sign in or use the app. Gmail and Drive access (modify, send,
full Drive) is requested separately and optionally, via the "Connect Gmail &
Drive" action on the dashboard (`lib/google/connect-client.ts`). The refresh
token Google returns from that step is stored server-side
(`google_connections` table) so the daily sync can read each user's mailbox.
Users who skip it can still use every feature that doesn't depend on Gmail/
Drive; the dashboard just shows an optional "Connect" prompt instead of
syncing automatically.

## 1. Google Cloud project

1. Open https://console.cloud.google.com and create or select a project.
2. **APIs & Services → Library**: enable **Gmail API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: *Internal* (Google Workspace) so no verification is needed.
   - Add scopes:
     - `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`
     - `https://www.googleapis.com/auth/gmail.modify` (needed to trash processed Archive emails)
     - `https://www.googleapis.com/auth/gmail.send` (only needed for *Send by Email*)
     - `https://www.googleapis.com/auth/drive` (full access, so the app can find pre-existing folders)
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

- Sign-in (`app/login/page.tsx`) only requests `email`/`profile`, with no
  `access_type`/`prompt` override, so it never prompts for Gmail/Drive and
  never stores a Google token — new users land on the dashboard with
  `gmail_status = 'disconnected'` (a neutral, non-error state).
- The dashboard shows a dismiss-free "Connect Gmail & Drive" prompt while
  `gmail_status !== 'connected'`. Clicking it calls `connectGoogleServices()`
  (`lib/google/connect-client.ts`), which requests the full scope set with
  `access_type=offline` and `prompt=consent`, tagging the redirect with
  `?google=connect`.
- `/auth/callback`'s `AuthReturnHandler` only posts the provider tokens to
  `/api/auth/google-tokens` (which stores them and marks the user as
  *Connected*) when that `google=connect` marker is present — a plain
  sign-in round-trip never does, even if Google happens to include a token.
- The daily Vercel cron (`vercel.json`) calls `/api/cron/sync` with the
  `CRON_SECRET`; admins can also trigger *Sync now* from the Admin → Gmail tab.
- If Google revokes the token (user removed access), the sync marks the user
  as **Gmail Authorization Required**; clicking "Connect Gmail & Drive" again
  reconnects.

## Removing the send scope

If you prefer strictly read-only access, remove `gmail.send` from
`GOOGLE_CONNECT_SCOPES` in `lib/google/connect-client.ts` and from
`GOOGLE_SCOPES` in `lib/google/oauth.ts`. The *Send by Email* button will
then return an authorization error.
