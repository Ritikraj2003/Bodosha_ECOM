import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const { Client } = pg;
const envPath = resolve(process.cwd(), '.env.local');
const lines = readFileSync(envPath, 'utf-8').split('\n');
let conn = '';
for (const line of lines) {
  if (line.startsWith('DATABASE_URL=')) {
    conn = line.substring('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  }
}

const client = new Client({
  connectionString: conn,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to DB. Adding columns to public.addresses...');
  await client.query(`
    ALTER TABLE public.addresses
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS locality TEXT,
    ADD COLUMN IF NOT EXISTS landmark TEXT;
  `);
  console.log('✅ Successfully updated public.addresses columns!');
  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
