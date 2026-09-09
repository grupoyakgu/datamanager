# YAKGU Knowledge Hub - Development Documentation

## Project Overview

YAKGU Knowledge Hub is a centralized knowledge management system for Grupo Yakgu. It enables automatic ingestion of meeting summaries from Gmail, AI-powered extraction of structured data, semantic search, and comprehensive knowledge organization.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (custom implementations)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Google OAuth)
- **State Management**: React Query + React Context
- **AI/Extraction**: OpenAI API

## Key Features (In Development)

### 1. Authentication
- Google OAuth login via Supabase
- User profile management
- Session management

### 2. Meeting Summaries
- Ingest summaries from Gmail automatically
- Display summaries with metadata
- Extract participants, topics, decisions, action items via AI
- Calculate completeness score

### 3. Organization
- Folder-based organization (not hierarchical)
- Tag-based categorization (multiple tags per summary)
- No duplication - each summary belongs to one folder

### 4. Search
- Full-text search across summaries
- Filter by date, folder, tags, participants
- Natural language search (semantic - future enhancement)

### 5. Admin Dashboard
- User management
- Folder management
- Tag management
- Gmail integration setup

## Database Schema

See `migrations/001_initial_schema.sql` for full schema.

## Environment Variables

Create `.env.local`:

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
npm run build
npm start
```
