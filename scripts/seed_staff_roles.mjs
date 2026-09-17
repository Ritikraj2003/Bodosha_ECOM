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

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // 1. Ensure 'staff' role
  let staffRole = await client.query("SELECT id FROM public.roles WHERE slug = 'staff'");
  if (staffRole.rows.length === 0) {
    const res = await client.query(`
      INSERT INTO public.roles (name, slug, description, is_system)
      VALUES ('Store Staff / Employee', 'staff', 'Store employee who manages kitchen orders, menu, and fulfillment', true)
      RETURNING id;
    `);
    console.log('Created staff role:', res.rows[0].id);
    staffRole = res;
  }
  const staffRoleId = staffRole.rows[0].id;

  // 2. Ensure 'manager' role
  let managerRole = await client.query("SELECT id FROM public.roles WHERE slug = 'manager'");
  if (managerRole.rows.length === 0) {
    const res = await client.query(`
      INSERT INTO public.roles (name, slug, description, is_system)
      VALUES ('Store Manager', 'manager', 'Store manager overseeing staff, daily expenses, inventory, and operations', true)
      RETURNING id;
    `);
    console.log('Created manager role:', res.rows[0].id);
    managerRole = res;
  }
  const managerRoleId = managerRole.rows[0].id;

  // 3. Assign staff permissions
  const staffCodes = ['orders.view', 'orders.update_status', 'delivery.view', 'delivery.assign', 'products.view', 'products.create', 'products.edit', 'categories.manage'];
  const staffPerms = await client.query('SELECT id FROM public.permissions WHERE code = ANY($1)', [staffCodes]);
  for (const row of staffPerms.rows) {
    await client.query(
      'INSERT INTO public.role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [staffRoleId, row.id]
    );
  }
  console.log(`Assigned ${staffPerms.rows.length} permissions to Staff role`);

  // 4. Assign manager permissions
  const managerCodes = ['orders.view', 'orders.update_status', 'orders.cancel', 'orders.refund', 'delivery.view', 'delivery.assign', 'products.view', 'products.create', 'products.edit', 'categories.manage', 'users.view', 'expenses.manage', 'wallet.view'];
  const managerPerms = await client.query('SELECT id FROM public.permissions WHERE code = ANY($1)', [managerCodes]);
  for (const row of managerPerms.rows) {
    await client.query(
      'INSERT INTO public.role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [managerRoleId, row.id]
    );
  }
  console.log(`Assigned ${managerPerms.rows.length} permissions to Manager role`);

  await client.end();
}

main().catch(console.error);
