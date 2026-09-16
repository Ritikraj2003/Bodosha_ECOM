import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sql = `
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_balance numeric(10,2) NOT NULL DEFAULT 0;
  CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    amount numeric(10,2) not null,
    type text not null check (type in ('credit','debit','payment')),
    reference text,
    note text,
    created_at timestamptz not null default now()
  );
`;

async function main() {
  console.log('Running wallet setup SQL...');

  // Try direct SQL via supabase-js admin client
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Run ALTER TABLE
  const { error: e1 } = await admin.rpc('exec_sql', { query: 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_balance numeric(10,2) NOT NULL DEFAULT 0;' });
  if (e1) console.log('Note: exec_sql RPC not available, trying direct queries...');

  // Try creating the table via raw query
  const { error: e2 } = await admin.from('wallet_transactions').select('id').limit(1);
  if (e2 && e2.code === 'PGRST116') {
    console.log('wallet_transactions table does not exist yet. Creating...');
    // Use Supabase Management API approach - run via direct fetch
    console.log('\nPlease run this SQL in your Supabase dashboard SQL editor:\n');
    console.log(sql);
    console.log('\nOr use: supabase db execute --file supabase/migrations/20260725000000_add_wallet.sql');
  } else if (!e2) {
    console.log('wallet_transactions table already exists.');
  }

  // Check if wallet_balance column exists
  const { data: profileCheck } = await admin.from('profiles').select('wallet_balance').limit(1);
  if (profileCheck && typeof profileCheck[0]?.wallet_balance !== 'undefined') {
    console.log('wallet_balance column exists on profiles.');
  } else {
    console.log('\nwallet_balance column missing. Run the SQL below in Supabase dashboard SQL editor:\n');
    console.log('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_balance numeric(10,2) NOT NULL DEFAULT 0;');
  }

  console.log('\nDone! If columns/tables are missing, copy the SQL from supabase/migrations/20260725000000_add_wallet.sql and run it in your Supabase dashboard SQL Editor.');
}

main().catch(console.error);
