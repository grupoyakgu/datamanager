# Grupo Yakgu Data Manager - Development Documentation

## Project Overview

Grupo Yakgu Data Manager is the central data management platform for Grupo Yakgu. The first module, carried over from the earlier Knowledge Hub prototype, ingests meeting summaries from Gmail, extracts structured data with AI, and organises it with folders and tags. Further data modules will be added on the same foundation.

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

- Client code calls internal API routes through `apiFetch` in `lib/api-client.ts`, which attaches the Supabase session token. API routes validate the `Authorization: Bearer` header with `supabaseAdmin.auth.getUser`.
- Dark mode is class-based (`next-themes` with `attribute="class"`); colour tokens live in `app/globals.css`.
- Keep `types/database.ts` in sync with `migrations/`.
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

See `migrations/001_initial_schema.sql` for the full schema.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
OPENAI_API_KEY=your_openai_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_EMAIL=koby@grupoyakgu.es
```

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
npm start
```
