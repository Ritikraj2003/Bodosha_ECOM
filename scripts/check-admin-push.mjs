import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="?([^"\n\r]+)"?/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\n\r]+)"?/)[1];
const supabase = createClient(url, key);

async function check() {
  const { data: admins, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .or('role.in.(admin,super_admin,owner)');
  console.log('Admins in DB:', { admins, error });

  // Check subscriptions for those admins
  const adminIds = (admins || []).map(a => a.id);
  const { data: subs } = await supabase
    .from('user_push_subscriptions')
    .select('id, user_id, user_agent')
    .in('user_id', adminIds);
  console.log('Admin subscriptions:', subs);
}
check();
