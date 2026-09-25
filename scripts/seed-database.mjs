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

const adminEmail = process.argv[2] || 'ane@gmail.com';
const adminPassword = process.argv[3] || 'Qwerty@123';
const adminName = process.argv[4] || 'Super Administrator';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: DATABASE_URL not found in .env.local');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// All 41 system permissions
const ALL_PERMISSIONS = [
  { name: 'Dashboard', code: 'DASH', desc: 'Access and view main dashboard overview' },
  { name: 'Dashboard | Filter', code: 'DASHFL', desc: 'Filter dashboard analytics by date range' },
  { name: 'Expenses', code: 'EXPENSES', desc: 'Access daily expenses tracker' },
  { name: 'Expenses | Add', code: 'EXP_ADD', desc: 'Record daily expenses' },
  { name: 'Expenses | Invest', code: 'EXP_INVEST', desc: 'Configure starting balance / investment funds' },
  { name: 'In-Store', code: 'INSTORE', desc: 'Access in-store POS counter' },
  { name: 'In-Store | History', code: 'INSTORE_HIST', desc: 'View in-store order history tab' },
  { name: 'Orders', code: 'ORDERS', desc: 'Access orders directory' },
  { name: 'Orders | History', code: 'ORDERS_HIST', desc: 'View delivered and cancelled order history' },
  { name: 'Orders | Running', code: 'ORDERS_RUNNING', desc: 'View and manage running active orders' },
  { name: 'Payments', code: 'PAYMENTS', desc: 'Access payments & billing section' },
  { name: 'Payments | Export', code: 'PAYMENTS_EXPORT', desc: 'Export payment reports to CSV or Excel' },
  { name: 'Payments | Show/Hide', code: 'PAYMENTS_TOGGLE', desc: 'Toggle show/hide payment records' },
  { name: 'Setting | Audit Log', code: 'SET_AUDIT', desc: 'View audit logs of employee actions' },
  { name: 'Setting | Bumper Offer', code: 'SET_OFFERS', desc: 'Manage promotional banners and bumper offers' },
  { name: 'Setting | Category', code: 'SET_CAT', desc: 'Access menu categories management' },
  { name: 'Setting | Category | Add', code: 'SET_CAT_ADD', desc: 'Add new category' },
  { name: 'Setting | Category | Delete', code: 'SET_CAT_DEL', desc: 'Delete category' },
  { name: 'Setting | Category | Edit', code: 'SET_CAT_EDIT', desc: 'Edit category details' },
  { name: 'Setting | General Setting', code: 'SET_GEN', desc: 'Access store general settings' },
  { name: 'Setting | General Setting | Edit', code: 'SET_GEN_EDIT', desc: 'Edit payment credentials, timings and store details' },
  { name: 'Setting | Product', code: 'SET_PROD', desc: 'Access menu products management' },
  { name: 'Setting | Product | Add', code: 'SET_PROD_ADD', desc: 'Add new food item or product' },
  { name: 'Setting | Product | Delete', code: 'SET_PROD_DEL', desc: 'Delete or archive product' },
  { name: 'Setting | Product | Edit', code: 'SET_PROD_EDIT', desc: 'Edit product details, price, and stock' },
  { name: 'User Management | Customer', code: 'USER_CUST', desc: 'Access customer directory' },
  { name: 'User Management | Customer | Credit Wallet', code: 'USER_CUST_CREDIT', desc: 'Adjust credit limit or top up customer wallet' },
  { name: 'User Management | Customer | Suspend', code: 'USER_CUST_SUSPEND', desc: 'Suspend or block customer account' },
  { name: 'User Management | Employee', code: 'USER_EMP', desc: 'Access employee directory' },
  { name: 'User Management | Employee | Add', code: 'USER_EMP_ADD', desc: 'Add new employee account' },
  { name: 'User Management | Employee | Delete', code: 'USER_EMP_DEL', desc: 'Delete / deactivate employee account' },
  { name: 'User Management | Employee | Edit', code: 'USER_EMP_EDIT', desc: 'Edit employee details, password, and role' },
  { name: 'User Management | Roles & Permissions', code: 'USER_ROLES', desc: 'Access roles & permissions management' },
  { name: 'User Management | Roles & Permissions | Add', code: 'USER_ROLES_ADD', desc: 'Create new custom role' },
  { name: 'User Management | Roles & Permissions | Delete', code: 'USER_ROLES_DEL', desc: 'Delete custom role' },
  { name: 'User Management | Roles & Permissions | Edit', code: 'USER_ROLES_EDIT', desc: 'Edit role permissions matrix' },
  { name: 'Wallet KYC', code: 'WALLET_KYC', desc: 'Access Wallet KYC tab' },
  { name: 'Wallet KYC | Check Penalty', code: 'WALLET_KYC_PENALTY', desc: 'Check and waive BNPL overdue penalties' },
  { name: 'Wallet KYC | History', code: 'WALLET_KYC_HIST', desc: 'View wallet credit and transaction history' },
  { name: 'Wallet KYC | Set Limit', code: 'WALLET_KYC_LIMIT', desc: 'Set and adjust student credit limits' },
  { name: 'Wallet KYC | View', code: 'WALLET_KYC_VIEW', desc: 'View student KYC submissions and documents' }
];

async function main() {
  try {
    await client.connect();
    console.log('\x1b[32m%s\x1b[0m', '⚡ Connected to PostgreSQL database...');

    console.log('\n--- Setup Required Roles & Permissions ---');

    // 0. Ensure pgcrypto extension exists for password hashing and UUIDs
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // Ensure core RBAC & user tables exist (self-contained, no migration dependency)
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        is_system BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        permission_name TEXT NOT NULL,
        permission_code TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_on TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.role_permissions (
        role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );

      CREATE TABLE IF NOT EXISTS public.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        full_name TEXT NOT NULL,
        phone TEXT,
        avatar_url TEXT,
        role TEXT NOT NULL DEFAULT 'student',
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_cit_student BOOLEAN NOT NULL DEFAULT false,
        student_email TEXT,
        student_verified_at TIMESTAMPTZ,
        roll_no TEXT,
        department TEXT,
        batch TEXT,
        is_verified BOOLEAN NOT NULL DEFAULT false,
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        isdeleted BOOLEAN NOT NULL DEFAULT false,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT,
        phone TEXT,
        role TEXT NOT NULL DEFAULT 'student',
        avatar_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.user_roles (
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS public.delivery_partners (
        id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
        user_id UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        vehicle_type TEXT NOT NULL DEFAULT 'bike',
        vehicle_number TEXT,
        license_plate TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_available BOOLEAN NOT NULL DEFAULT true,
        is_online BOOLEAN NOT NULL DEFAULT true,
        total_deliveries INTEGER NOT NULL DEFAULT 0,
        rating NUMERIC(3, 1) NOT NULL DEFAULT 5.0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.system_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'string',
        is_secret BOOLEAN NOT NULL DEFAULT false,
        is_public BOOLEAN NOT NULL DEFAULT false,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 1. Seed all 41 permissions
    console.log(`📦 Seeding ${ALL_PERMISSIONS.length} system permissions into public.permissions...`);
    for (const p of ALL_PERMISSIONS) {
      await client.query(`
        INSERT INTO public.permissions (permission_name, permission_code, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (permission_code) DO UPDATE SET
          permission_name = EXCLUDED.permission_name,
          description = EXCLUDED.description;
      `, [p.name, p.code, p.desc]);
    }
    console.log(`✅ System permissions seeded.`);

    // 2. Ensure ONLY the 2 system roles exist: Super Administrator & Delivery Partner
    await client.query(`
      INSERT INTO public.roles (name, slug, description, is_system, created_at, updated_at)
      VALUES 
        ('Super Administrator', 'super_admin', 'Full system access with all privileges', true, now(), now()),
        ('Delivery Partner', 'delivery', 'Pick up and deliver assigned customer orders', true, now(), now())
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_system = EXCLUDED.is_system,
        updated_at = now();
    `);

    // Clean up any other roles so ONLY Super Administrator and Delivery Partner exist initially
    await client.query(`
      DELETE FROM public.roles
      WHERE slug NOT IN ('super_admin', 'delivery');
    `);
    console.log(`✅ Roles ensured: Super Administrator & Delivery Partner.`);

    // 3. Map permissions to Super Administrator (ALL permissions)
    const superAdminRes = await client.query(`SELECT id FROM public.roles WHERE slug = 'super_admin' LIMIT 1;`);
    const superAdminRoleId = superAdminRes.rows[0]?.id;

    if (superAdminRoleId) {
      await client.query(`
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT $1, id
        FROM public.permissions
        ON CONFLICT (role_id, permission_id) DO NOTHING;
      `, [superAdminRoleId]);
      console.log(`✅ All ${ALL_PERMISSIONS.length} permissions mapped to Super Administrator.`);
    }


    // 5. Seed Super Administrator User
    console.log('\n--- Seeding Super Administrator Credentials ---');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log(`Role: super_admin`);

    const userRes = await client.query(`
      INSERT INTO public.users (
        email, password_hash, full_name, role, is_active, created_at, updated_at
      ) VALUES (
        $1,
        crypt($2, gen_salt('bf', 10)),
        $3,
        'super_admin',
        true,
        now(),
        now()
      )
      ON CONFLICT (email) DO UPDATE SET
        password_hash = crypt($2, gen_salt('bf', 10)),
        full_name = $3,
        role = 'super_admin',
        is_active = true,
        updated_at = now()
      RETURNING id, email, role, full_name;
    `, [adminEmail, adminPassword, adminName]);

    const admin = userRes.rows[0];
    const adminId = admin.id;
    console.log(`✅ Super Admin User: ${admin.email} (ID: ${adminId})`);

    // 6. Ensure Profile Record
    await client.query(`
      INSERT INTO public.profiles (
        id, email, full_name, role, is_active, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'super_admin', true, now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        email = $2,
        full_name = $3,
        role = 'super_admin',
        is_active = true,
        updated_at = now();
    `, [adminId, adminEmail, adminName]);
    console.log(`✅ Profile created/updated for ${admin.email}`);

    // 7. Link Super Admin in public.user_roles
    if (superAdminRoleId) {
      await client.query(`
        INSERT INTO public.user_roles (user_id, role_id, created_at)
        VALUES ($1, $2, now())
        ON CONFLICT (user_id, role_id) DO NOTHING;
      `, [adminId, superAdminRoleId]);
      console.log(`✅ Linked user to 'super_admin' in public.user_roles`);
    }

    // 8. Basic System Settings default
    await client.query(`
      INSERT INTO public.system_settings (key, value, type, is_secret, description)
      VALUES 
        ('admin_emails', $1, 'json', false, 'List of admin email accounts'),
        ('owner_email', $2, 'string', false, 'Primary platform owner contact email'),
        ('delivery_fee', '20', 'number', false, 'Flat delivery fee for orders'),
        ('maintenance_fee', '1', 'number', false, 'Standard platform maintenance charge'),
        ('store_open_time', '09:00', 'string', false, 'Daily opening hour'),
        ('store_close_time', '22:00', 'string', false, 'Daily closing hour'),
        ('store_is_open', 'true', 'boolean', false, 'Store status')
      ON CONFLICT (key) DO NOTHING;
    `, [JSON.stringify([adminEmail]), adminEmail]);
    console.log(`✅ Default system settings verified.`);

    console.log('\n\x1b[32m%s\x1b[0m', '🎉 Setup completed successfully!');
    console.log('Roles Created:');
    console.log('  1. Super Administrator (super_admin) - All 41 permissions');
    console.log('  2. Delivery Partner    (delivery)    - Delivery & Order permissions');
    console.log('\nLogin credentials:');
    console.log(`  Email:    ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Setup Error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
