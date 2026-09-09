import { Pool, QueryResult } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('DATABASE_URL not set, using fallback');
}

export const pool = new Pool({
  connectionString: databaseUrl || 'postgresql://localhost/yakgu',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function queryDatabase(text: string, params?: any[]) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Keep backward compatibility with some Supabase patterns for now
export const supabase = {
  from: (table: string) => ({
    select: (columns = '*') => ({
      eq: () => ({ data: [], error: null }),
    }),
  }),
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    signInWithOAuth: async () => ({ error: null }),
  },
};

export const supabaseAdmin = supabase;
