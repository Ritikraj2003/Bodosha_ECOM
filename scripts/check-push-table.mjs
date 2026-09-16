import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="?([^"\n\r]+)"?/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\n\r]+)"?/)[1];
const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('user_push_subscriptions').select('*').limit(1);
  console.log('Result:', JSON.stringify({ data, error }, null, 2));
}
check();
