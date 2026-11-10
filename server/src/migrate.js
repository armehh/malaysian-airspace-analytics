import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPool } from './lib/db.js';

const SQL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql');

export async function migrate(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const files = (await readdir(SQL_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  for (const f of files) {
    const { rowCount } = await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [f]);
    if (rowCount) continue;
    const sql = await readFile(path.join(SQL_DIR, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      applied.push(f);
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`Migrasi ${f} gagal: ${e.message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(process.env.DATABASE_URL);
  migrate(pool)
    .then((a) => console.log(a.length ? `Dijalankan: ${a.join(', ')}` : 'Skema sudah terkini'))
    .catch((e) => { console.error(e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
