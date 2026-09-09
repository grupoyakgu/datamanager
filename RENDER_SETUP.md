# Render PostgreSQL Setup Guide

## Step 1: Create Render PostgreSQL Database

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"PostgreSQL"**
3. Fill in the details:
   - **Name**: `yakgu-db`
   - **Database Name**: `yakgu`
   - **User**: `yakgu_user`
   - **Region**: Choose closest to your location
   - **PostgreSQL Version**: 15 (or latest)
4. Click **"Create Database"**
5. Wait 2-3 minutes for the database to be created

## Step 2: Get Your Database URL

1. Go to your database dashboard on Render
2. Copy the **"Internal Database URL"** (for internal services)
   - Format: `postgresql://yakgu_user:PASSWORD@yakgu-db.render.internal:5432/yakgu`
3. For external access, copy the **"External Database URL"** if needed

## Step 3: Set Environment Variables

Create `.env.local` in your project root:

```bash
# Copy this and replace with your actual Render URL from Step 2
DATABASE_URL=postgresql://yakgu_user:PASSWORD@yakgu-db.render.internal:5432/yakgu

# Firebase Auth (set up separately)
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project

# OpenAI
OPENAI_API_KEY=your_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_EMAIL=koby@grupoyakgu.es
NODE_ENV=development
```

## Step 4: Run Database Migrations

### Local Development:

```bash
# Install node-postgres (already done)
npm install

# Run migrations using psql (Render provides this)
psql $DATABASE_URL < migrations/001_initial_schema.sql
```

Or use this Node.js script:

```bash
node scripts/run-migrations.js
```

### Production (via Render Dashboard):

1. Go to your database in Render dashboard
2. Click **"Connect"** → **"External Connection"** (if needed)
3. Use the external URL to run migrations from your local machine:

```bash
psql postgresql://yakgu_user:PASSWORD@region.render.com:5432/yakgu < migrations/001_initial_schema.sql
```

## Step 5: Verify Connection

```bash
npm run dev
# Check console - should show no database errors
```

## Step 6: Deploy to Production

When deploying to Vercel/Railway:

1. Add `DATABASE_URL` environment variable
2. Use Render's **"External Database URL"** (for external services)
3. Update your `.env.production` with the external URL

## Free Tier Limits

- **Storage**: 256 MB (free tier)
- **Connections**: 5 concurrent
- **No data limit**: Unused databases may be deleted after 7 days of inactivity
- **Pricing**: Free tier included, upgrades available

## Troubleshooting

### "connection refused"
- Check if database is still running on Render dashboard
- Verify DATABASE_URL is correct
- For local dev: Make sure PostgreSQL is running locally

### "permission denied"
- Double-check username and password in DATABASE_URL
- Ensure user has proper permissions in Render dashboard

### "database does not exist"
- Run migrations: `psql $DATABASE_URL < migrations/001_initial_schema.sql`

## Testing Connection

```bash
# Test from command line
psql $DATABASE_URL -c "SELECT version();"

# Or use Node.js
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error(err);
  else console.log('✅ Connected:', res.rows);
  process.exit(0);
});
"
```

## Next: Setup Firebase Auth

Since we're moving away from Supabase Auth:

1. Go to https://firebase.google.com
2. Create a new Firebase project
3. Enable Google Sign-in
4. Copy credentials to `.env.local`
5. Update authentication logic in `/app/login/page.tsx`

See `FIREBASE_AUTH_SETUP.md` for details.
