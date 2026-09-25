import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const { Client } = pg;

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: DATABASE_URL not found in .env.local');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  try {
    console.log('\x1b[36m%s\x1b[0m', '🚀 Connecting to PostgreSQL Database...');
    await client.connect();
    console.log('\x1b[32m%s\x1b[0m', '✅ Connected successfully.');

    const schemaPath = resolve(process.cwd(), 'supabase', 'complete_schema.sql');
    if (!existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    console.log('\x1b[36m%s\x1b[0m', `📄 Reading SQL schema from ${schemaPath}...`);
    const sql = readFileSync(schemaPath, 'utf-8');

    console.log('\x1b[36m%s\x1b[0m', '⏳ Executing complete schema migration...');
    await client.query(sql);
    console.log('\x1b[32m%s\x1b[0m', '✅ Master schema migration executed successfully!');

    // Check tables created in public schema
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('\n\x1b[32m%s\x1b[0m', `📊 Public Tables in Database (${tablesRes.rows.length} total):`);
    tablesRes.rows.forEach((r, idx) => {
      console.log(`   ${(idx + 1).toString().padStart(2, ' ')}. ${r.table_name}`);
    });

    console.log('\n\x1b[32m%s\x1b[0m', '🎉 All database migrations applied successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ Migration Error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
