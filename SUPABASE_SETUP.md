# Supabase Setup Guide

## Step 1: Environment Variables

Your `.env.local` is already configured with:
```
NEXT_PUBLIC_SUPABASE_URL=https://slggcylwtgjlhvxumqsj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Step 2: Run Database Migrations

### Option A: Using Supabase SQL Editor (Easiest)

1. Go to https://app.supabase.com/project/slggcylwtgjlhvxumqsj
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy content from `migrations/001_initial_schema.sql`
5. Paste into the query editor
6. Click **Run**

### Option B: Using psql CLI

```bash
psql "postgresql://postgres:PASSWORD@db.slggcylwtgjlhvxumqsj.supabase.co:5432/postgres" < migrations/001_initial_schema.sql
```

Get the password from Supabase dashboard → Settings → Database.

## Step 3: Verify Setup

```bash
npm run dev
```

Visit http://localhost:3000/login - should load without database errors.

## Step 4: Gmail Integration (Next)

See `GMAIL_SETUP.md` for connecting Gmail.

## Troubleshooting

**"Cannot find module '@supabase/supabase-js'"**
```bash
npm install
```

**"Invalid API key"**
- Verify credentials in `.env.local`
- Check they match Supabase project settings

**"RLS policy error"**
- Migrations create default RLS policies
- If you get permission errors, check the policies in Supabase dashboard
