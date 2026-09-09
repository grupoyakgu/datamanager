# Grupo Yakgu Data Manager

Central knowledge and data platform for Grupo Yakgu. The first module is the
**Knowledge Hub**: meeting summaries are collected automatically from Gmail,
analysed with AI, organised into folders and tags, and searchable with natural
language. A Google Drive browser and an admin area complete the MVP.

Built with Next.js (App Router), TypeScript, Tailwind CSS v4, Supabase
(Postgres + Auth + pgvector) and the OpenAI API.

## Features

- **Google sign-in** (Supabase Auth) with Gmail read-only, Gmail send and Drive read-only scopes.
- **Automatic ingestion**: hourly cron (and *Sync now*) scans connected mailboxes for
  subjects containing `סיכום`, `Summary` or `Resumen`; each email is stored once
  (deduplicated by RFC Message-ID across mailboxes).
- **AI extraction**: meeting date/time, participants, companies, topics, action items,
  decisions and dictionary tags; deterministic completeness score with missing-field list.
- **Folders (one per summary) + tags (many)**, folder rules (`tag → folder`), favorites.
- **Search**: full-text with date/folder/tag/participant filters, plus *Ask* natural-language
  questions answered with semantic (pgvector) search.
- **Summary page** with header metadata, content, AI information, folder/tag editing,
  re-run extraction and *Send by Email* through the user's Gmail.
- **Google Drive** browser with folder navigation, search and *Open in Drive* links.
- **Admin**: users (status, role, Gmail status, last sync), folders, tags (with aliases),
  Gmail sync settings, Drive root, AI settings (fields, completeness weights), admin emails, audit log.
- **UI**: collapsible sidebar, light/dark theme and English/Spanish language saved per user.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase, Google and OpenAI values
npm run dev
```

1. Apply `migrations/001_initial_schema.sql` and `migrations/002_knowledge_hub.sql` (see `SUPABASE_SETUP.md`).
2. Configure Google OAuth with the required scopes (see `GOOGLE_SETUP.md`).
3. Open http://localhost:3000 and sign in with Google.

## Scripts

| Command             | Purpose                      |
| ------------------- | ---------------------------- |
| `npm run dev`       | Start the development server |
| `npm run build`     | Production build             |
| `npm start`         | Serve the production build   |
| `npm run lint`      | Run ESLint                   |
| `npm run typecheck` | Run the TypeScript compiler  |

## Project layout

```
app/(app)/       Authenticated pages: dashboard, summaries, files, tags, people, favorites, admin
app/api/         Route handlers (Bearer-token auth via lib/auth.ts)
app/login, app/auth/callback   Sign-in and OAuth token capture
components/      UI primitives, layout chrome, summary and admin components
hooks/           useUser, data hooks (React Query)
lib/ai/          OpenAI client, extraction, embeddings, natural-language query parser
lib/google/      OAuth token refresh, Gmail and Drive clients (REST via fetch)
lib/summaries/   Repository/view mapping, processing pipeline, Gmail sync
lib/i18n/        English/Spanish dictionaries and context
migrations/      SQL migrations
types/           Shared TypeScript types
```

## Deployment

Production deploys from the `main` branch on Vercel; `vercel.json` schedules `/api/cron/sync` hourly. Set every
variable from `.env.example` in the project settings (`CRON_SECRET` protects the cron route).
