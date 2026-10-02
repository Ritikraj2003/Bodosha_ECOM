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
  console.error('❌ Error: DATABASE_URL not found in .env.local');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    console.log('Adding delivery_latitude and delivery_longitude to public.orders...');
    await client.query(`
      ALTER TABLE public.orders 
      ADD COLUMN IF NOT EXISTS delivery_latitude NUMERIC(10, 7),
      ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(10, 7);
    `);
    console.log('✅ Columns added or already exist in public.orders');

    // Check if restaurant has latitude and longitude
    const restRes = await client.query('SELECT id, name, latitude, longitude FROM public.restaurants LIMIT 1');
    if (restRes.rows.length > 0) {
      console.log('Restaurant:', restRes.rows[0]);
      if (!restRes.rows[0].latitude || !restRes.rows[0].longitude) {
        // Set default Badmaas House Cafe location (CIT Kokrajhar)
        await client.query(`
          UPDATE public.restaurants 
          SET latitude = 26.505524, longitude = 90.288218 
          WHERE id = $1
        `, [restRes.rows[0].id]);
        console.log('✅ Set default coordinates for restaurant (CIT Kokrajhar: 26.505524, 90.288218)');
      }
    }

    await client.end();
    console.log('🎉 Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
