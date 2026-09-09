# Grupo Yakgu Data Manager

Central data management platform for Grupo Yakgu. Built with Next.js (App Router), TypeScript, Tailwind CSS and Supabase.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000. Signed-out visitors are sent to `/login`; signed-in users land on `/dashboard`.

## Scripts

| Command         | Purpose                         |
| --------------- | ------------------------------- |
| `npm run dev`   | Start the development server    |
| `npm run build` | Production build                |
| `npm start`     | Serve the production build      |
| `npm run lint`  | Run ESLint                      |
| `npm run typecheck` | Run the TypeScript compiler |

## Project layout

```
app/            Routes (App Router). API routes live under app/api.
components/     UI primitives (components/ui) and layout chrome (components/layout).
hooks/          React hooks (e.g. useUser).
lib/            Supabase clients, API fetch helper, search and AI extraction.
migrations/     SQL migrations for the Supabase database.
types/          Shared TypeScript types mirroring the database schema.
```

## Database

Apply `migrations/001_initial_schema.sql` to the Supabase project. See `SUPABASE_SETUP.md` for step-by-step instructions.

## Environment variables

See `.env.example`. Never commit `.env.local`.
