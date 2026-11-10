import pg from 'pg';

export function createPool(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL belum ditetapkan');
  // Neon/Supabase: letak ?sslmode=require dalam URL.
  return new pg.Pool({ connectionString, max: 5 });
}
