# Grupo Yakgu Data Manager - Development Documentation

## Project Overview

Grupo Yakgu Data Manager is the central data management platform for Grupo Yakgu. The first module is the Knowledge Hub: it ingests meeting summaries from Gmail (subjects containing סיכום / Summary / Resumen), extracts structured data with AI, scores completeness deterministically, organises summaries with one folder and many tags, offers semantic natural-language search, browses Google Drive, and lets users send summaries by email. Further data modules will be added on the same foundation.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 (tokens defined in `app/globals.css` via `@theme`; no `tailwind.config` file)
- **UI Components**: shadcn/ui-style primitives in `components/ui`
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Google OAuth); callback handled at `app/auth/callback`
- **State Management**: React Query + React Context
- **AI/Extraction**: OpenAI API

## Conventions

- Client code calls internal API routes through `api`/`apiFetch` in `lib/api-client.ts`, which attaches the Supabase session token. Route handlers wrap logic in `handleRoute` (`lib/http.ts`) and authenticate with `requireUser` / `requireAdmin` (`lib/auth.ts`).
- The service-role client is obtained lazily with `getSupabaseAdmin()`; never import it into client components.
- Google APIs are called with plain `fetch` through `googleFetch` (`lib/google/oauth.ts`), which refreshes tokens and flags users as "authorization required" on revocation.
- New summaries go through `processSummary` (`lib/summaries/process.ts`): extraction → tags → folder rules → completeness → embedding.
- Data model separates **source** (`meeting_summaries.source`), **folder** (`folder_id`, exactly one) and **tags** (`meeting_summary_tags`, many).
- UI strings live in `lib/i18n/dictionaries.ts` (en/es); use `useT()` in components. Dark mode is class-based (`next-themes`); colour tokens live in `app/globals.css`.
- Keep `types/database.ts` in sync with `migrations/`. Apply new migrations to the Supabase project and commit the SQL file.
- Run `npm run typecheck && npm run lint && npm run build` before pushing.

## Modules

### Authentication
- Google OAuth login via Supabase
- User profile row in `users` table

### Meeting Summaries (first data module)
- Ingest summaries from Gmail
- Extract participants, topics, decisions, action items via AI
- Completeness score per summary
- Folder (single) and tag (multiple) organisation
- Full-text search with date, folder, tag and participant filters

### Admin
- User, folder and tag management
- Gmail integration setup

## Database Schema

See `migrations/001_initial_schema.sql` and `migrations/002_knowledge_hub.sql`. Key tables: `users`, `google_connections`, `folders`, `folder_rules`, `tags`, `meeting_summaries` (with `embedding` and `search_vector`), `meeting_summary_tags`, `extracted_data`, `favorites`, `app_settings`, `audit_logs`. Semantic search uses the `match_summaries` SQL function.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
GOOGLE_CLIENT_ID=oauth_client_id
GOOGLE_CLIENT_SECRET=oauth_client_secret
OPENAI_API_KEY=your_openai_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=random_string
```

Admin emails are stored in the `admin_emails` app setting (default `koby@grupoyakgu.es`), not in an env var. See `GOOGLE_SETUP.md` and `SUPABASE_SETUP.md`.

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
npm start
```
