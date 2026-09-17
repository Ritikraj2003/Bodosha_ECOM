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

const email = process.argv[2] || 'admin@dilipda.com';
const password = process.argv[3] || 'Admin@123456';
const fullName = process.argv[4] || 'Super Administrator';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Error: DATABASE_URL not found in .env.local');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database...');

    // 1. Check if user already exists
    const existing = await client.query('SELECT id, email, role FROM public.users WHERE email = $1', [email]);
    let userId;

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      console.log(`User ${email} already exists (ID: ${userId}). Updating password and role to super_admin...`);
      await client.query(`
        UPDATE public.users 
        SET password_hash = crypt($1, gen_salt('bf', 10)),
            role = 'super_admin',
            is_active = true,
            updated_at = now()
        WHERE id = $2
      `, [password, userId]);
    } else {
      console.log(`Creating new superadmin user ${email}...`);
      const insertRes = await client.query(`
        INSERT INTO public.users (email, password_hash, full_name, role, is_active)
        VALUES ($1, crypt($2, gen_salt('bf', 10)), $3, 'super_admin', true)
        RETURNING id;
      `, [email, password, fullName]);
      userId = insertRes.rows[0].id;
      console.log(`Created user ${email} (ID: ${userId})`);
    }

    // 2. Assign super_admin role in public.user_roles
    const roleRes = await client.query("SELECT id FROM public.roles WHERE slug = 'super_admin'");
    if (roleRes.rows.length > 0) {
      const superAdminRoleId = roleRes.rows[0].id;
      await client.query(`
        INSERT INTO public.user_roles (user_id, role_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, role_id) DO NOTHING;
      `, [userId, superAdminRoleId]);
      console.log('✓ Assigned super_admin role in public.user_roles');
    }

    // 3. Ensure wallet exists
    await client.query(`
      INSERT INTO public.wallets (user_id, balance, credit_limit, status)
      VALUES ($1, 5000.00, 10000.00, 'active')
      ON CONFLICT (user_id) DO UPDATE SET status = 'active';
    `, [userId]);
    console.log('✓ Wallet initialized and activated');

    console.log('\n===========================================');
    console.log('SUPERADMIN CREDENTIALS SEEDED SUCCESSFULLY:');
    console.log('===========================================');
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Role:     super_admin`);
    console.log('===========================================\n');

  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
