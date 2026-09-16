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

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/seed-admin.mjs <email>');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  const perPage = 1000;
  let page = 1;
  let total = 0;

  do {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const found = data.users.find((u) => u.email === email);
    if (found) return found;

    total = data.total ?? data.users.length;
    if (data.users.length < perPage) break;
    page++;
  } while ((page - 1) * perPage < total);

  return null;
}

async function main() {
  // First try: look up in profiles table (user might exist but auth admin list may not find them)
  console.log(`Looking up "${email}" in profiles table...`);
  const { data: existingProfile, error: profileLookupError } = await admin
    .from('profiles')
    .select('id, email, role, full_name')
    .eq('email', email)
    .maybeSingle();

  if (profileLookupError) {
    console.error('Error querying profiles:', profileLookupError.message);
  }

  let userId = existingProfile?.id;

  if (userId) {
    console.log(`✓ Found user in profiles table (id: ${userId})`);
  } else {
    // Second try: search auth users (with pagination)
    console.log('Not found in profiles, searching auth users...');
    const authUser = await findUserByEmail(email);
    if (authUser) {
      userId = authUser.id;
      console.log(`✓ Found user in auth (id: ${userId})`);
    }
  }

  if (!userId) {
    console.error(`User with email "${email}" not found.`);
    const { data: allProfiles } = await admin
      .from('profiles')
      .select('email, role')
      .limit(50);
    if (allProfiles && allProfiles.length > 0) {
      console.error('\nExisting profiles (first 50):');
      allProfiles.forEach((p) => console.error(`  ${p.email} (${p.role})`));
    } else {
      console.error('\nNo profiles found. User may not have signed up yet.');
    }
    process.exit(1);
  }

  // Update auth user metadata (so client-side store gets admin role)
  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { role: 'admin' },
  });
  if (metadataError) {
    console.error('Failed to update user metadata:', metadataError.message);
    process.exit(1);
  }
  console.log('✓ Auth metadata updated');

  // Upsert profile with admin role (so server-side check passes)
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: userId,
      role: 'admin',
      email: email,
      full_name: existingProfile?.full_name ?? email.split('@')[0],
      is_active: true,
    }, { onConflict: 'id' });

  if (profileError) {
    console.error('Failed to update profile:', profileError.message);
    process.exit(1);
  }
  console.log('✓ Profile updated');

  console.log(`\nDone! User "${email}" is now an admin.`);
  console.log('Sign out and sign back in, then visit /dashboard/admin');
}

main();
