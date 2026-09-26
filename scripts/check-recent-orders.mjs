import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const { Client } = pg;
const envPath = resolve(process.cwd(), '.env.local');
const lines = readFileSync(envPath, 'utf-8').split('\n');
for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  const k = t.slice(0, eq).trim();
  if (!process.env[k]) process.env[k] = v;
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function main() {
  await client.connect();
  const res = await client.query('SELECT * FROM public.orders ORDER BY created_at DESC LIMIT 5');
  console.log('Orders:', JSON.stringify(res.rows, null, 2));
  const items = await client.query('SELECT * FROM public.order_items ORDER BY created_at DESC LIMIT 5');
  console.log('Order Items:', JSON.stringify(items.rows, null, 2));
  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
