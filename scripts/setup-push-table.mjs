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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function check() {
  const { data, error } = await supabase.from('user_push_subscriptions').select('id').limit(1);
  if (error) {
    console.log('Check result error code:', error.code, error.message);
    if (error.code === 'PGRST205' || error.code === 'PGRST204' || error.code === '42P01' || error.message.includes('relation "public.user_push_subscriptions" does not exist') || error.message.includes('Could not find the table')) {
      console.log('TABLE_DOES_NOT_EXIST');
      // Try exec_sql RPC
      const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260910120000_create_user_push_subscriptions.sql'), 'utf-8');
      const { error: rpcErr } = await supabase.rpc('exec_sql', { query: sql });
      if (rpcErr) {
        console.log('RPC_EXEC_SQL_NOT_AVAILABLE:', rpcErr.message);
      } else {
        console.log('TABLE_CREATED_VIA_RPC');
      }
    }
  } else {
    console.log('TABLE_ALREADY_EXISTS');
  }
}

check();
