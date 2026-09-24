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

async function main() {
  try {
    await client.connect();
    console.log('\x1b[32m%s\x1b[0m', '⚡ Connected to PostgreSQL database...');

    // -------------------------------------------------------------
    // 1. SEED / UPDATE SUPER ADMIN ACCOUNT
    // -------------------------------------------------------------
    console.log('\n--- 1. Seeding Super Administrator Account ---');
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
    console.log(`✅ Admin User Ready: ${admin.email} (ID: ${adminId})`);

    // Ensure Profile
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

    // Link RBAC user_roles
    try {
      const roleRes = await client.query(`SELECT id FROM public.roles WHERE slug = 'super_admin' LIMIT 1`);
      if (roleRes.rows.length > 0) {
        await client.query(`
          INSERT INTO public.user_roles (user_id, role_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING;
        `, [adminId, roleRes.rows[0].id]);
        console.log(`✅ Linked to 'super_admin' role in public.user_roles`);
      }
    } catch {
      // Role table optional
    }

    // Ensure Admin & Owner Emails in system_settings
    try {
      await client.query(`
        INSERT INTO public.system_settings (key, value, type, is_secret, is_public, description)
        VALUES 
          ('admin_emails', $1, 'json', false, false, 'List of admin email accounts'),
          ('owner_email', $2, 'string', false, false, 'Primary platform owner contact email')
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value;
      `, [JSON.stringify([adminEmail]), adminEmail]);
    } catch {
      // system_settings optional
    }

    // -------------------------------------------------------------
    // 2. SEED DEFAULT RESTAURANT / STORE
    // -------------------------------------------------------------
    console.log('\n--- 2. Seeding Default Restaurant / Store ---');
    let restaurantId;
    const existingRest = await client.query(`SELECT id, name FROM public.restaurants LIMIT 1`);
    if (existingRest.rows.length > 0) {
      restaurantId = existingRest.rows[0].id;
      console.log(`✅ Restaurant Exists: ${existingRest.rows[0].name} (ID: ${restaurantId})`);
    } else {
      const restRes = await client.query(`
        INSERT INTO public.restaurants (
          owner_id, name, slug, description, cuisine_type, phone, email,
          address_line1, city, state, postal_code, is_active, is_open,
          opening_time, closing_time, created_at, updated_at
        ) VALUES (
          $1,
          'Bodosa Restaurant',
          'bodosa',
          'Hot delicious food delivered directly inside campus & hostel rooms',
          'Fast Food, North Indian, Snacks',
          '9876543210',
          $2,
          'CIT Campus Food Court',
          'Kokrajhar',
          'Assam',
          '783370',
          true,
          true,
          '09:00',
          '22:00',
          now(),
          now()
        )
        RETURNING id, name;
      `, [adminId, adminEmail]);
      restaurantId = restRes.rows[0].id;
      console.log(`✅ Created Restaurant: Bodosa Restaurant (ID: ${restaurantId})`);
    }

    // Ensure Restaurant Settings
    try {
      await client.query(`
        INSERT INTO public.restaurant_settings (
          restaurant_id, min_order_amount, delivery_fee, free_delivery_above,
          estimated_prep_time, is_bnpl_enabled, created_at, updated_at
        ) VALUES (
          $1, 0, 20, 200, 20, true, now(), now()
        )
        ON CONFLICT (restaurant_id) DO NOTHING;
      `, [restaurantId]);
    } catch {
      // restaurant_settings optional
    }

    // -------------------------------------------------------------
    // 3. SEED MENU CATEGORIES
    // -------------------------------------------------------------
    console.log('\n--- 3. Seeding Categories ---');
    const categories = [
      { name: 'Beverages', slug: 'beverages', desc: 'Cool shakes, hot tea, and chilled drinks', order: 1 },
      { name: 'Fast Food', slug: 'fast-food', desc: 'Crispy burgers, hot sandwiches, and rolls', order: 2 },
      { name: 'Chinese & Snacks', slug: 'chinese-snacks', desc: 'Noodles, chowmein, and quick bites', order: 3 },
      { name: 'Meals & Thali', slug: 'meals-thali', desc: 'Hearty rice bowls, biryani, and curries', order: 4 },
      { name: 'Combos & Specials', slug: 'combos', desc: 'Super saver lunch and dinner combos', order: 5 },
    ];

    const categoryMap = {};
    for (const cat of categories) {
      const catRes = await client.query(`
        INSERT INTO public.categories (
          restaurant_id, name, slug, description, display_order, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, true, now(), now())
        ON CONFLICT (restaurant_id, slug) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          display_order = EXCLUDED.display_order,
          is_active = true,
          updated_at = now()
        RETURNING id, slug;
      `, [restaurantId, cat.name, cat.slug, cat.desc, cat.order]);
      categoryMap[cat.slug] = catRes.rows[0].id;
    }
    console.log(`✅ Seeded ${categories.length} Categories`);

    // -------------------------------------------------------------
    // 4. SEED SAMPLE MENU PRODUCTS
    // -------------------------------------------------------------
    console.log('\n--- 4. Seeding Menu Products ---');
    const sampleProducts = [
      {
        name: 'Cold Coffee with Ice Cream',
        slug: 'cold-coffee-with-ice-cream',
        category: 'beverages',
        price: 65,
        veg: true,
        desc: 'Rich brewed chilled coffee blended with creamy vanilla ice cream',
        badge: 'Bestseller',
      },
      {
        name: 'Chicken Burger',
        slug: 'chicken-burger',
        category: 'fast-food',
        price: 90,
        veg: false,
        desc: 'Crispy seasoned chicken patty topped with fresh lettuce, mayo & soft toasted buns',
        badge: 'Popular',
      },
      {
        name: 'Veg Hakka Chowmein',
        slug: 'veg-hakka-chowmein',
        category: 'chinese-snacks',
        price: 60,
        veg: true,
        desc: 'Wok-tossed noodles with bell peppers, crunchy cabbage, and Asian spices',
        badge: 'Classic',
      },
      {
        name: 'Chicken Dum Biryani',
        slug: 'chicken-dum-biryani',
        category: 'meals-thali',
        price: 140,
        veg: false,
        desc: 'Aromatic basmati rice layered with tender marinated chicken pieces and slow-cooked dum herbs',
        badge: 'Chef Special',
      },
      {
        name: 'Paneer Tikka Roll',
        slug: 'paneer-tikka-roll',
        category: 'fast-food',
        price: 75,
        veg: true,
        desc: 'Smokey paneer chunks tossed with onions, green chutney and wrapped in a soft paratha',
        badge: 'Hot',
      },
      {
        name: 'Special Student Lunch Thali',
        slug: 'special-student-lunch-thali',
        category: 'combos',
        price: 99,
        veg: true,
        desc: 'Complete meal: Rice, Dal, Seasonal Sabzi, 2 Roti, Papad, Salad & Pickle',
        badge: 'Value Pack',
      },
    ];

    for (const prod of sampleProducts) {
      const catId = categoryMap[prod.category] || null;
      await client.query(`
        INSERT INTO public.products (
          restaurant_id, category_id, name, slug, description, price,
          is_veg, is_available, badge, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, true, $8, now(), now()
        )
        ON CONFLICT (restaurant_id, slug) DO UPDATE SET
          name = EXCLUDED.name,
          price = EXCLUDED.price,
          description = EXCLUDED.description,
          is_available = true,
          updated_at = now();
      `, [
        restaurantId,
        catId,
        prod.name,
        prod.slug,
        prod.desc,
        prod.price,
        prod.veg,
        prod.badge,
      ]);
    }
    console.log(`✅ Seeded ${sampleProducts.length} Menu Products`);

    // -------------------------------------------------------------
    // 5. SEED WALLET FOR ADMIN
    // -------------------------------------------------------------
    console.log('\n--- 5. Initializing Admin Wallet ---');
    try {
      await client.query(`
        INSERT INTO public.wallets (
          user_id, balance, credit_limit, status, created_at, updated_at
        ) VALUES (
          $1, 5000.00, 10000.00, 'active', now(), now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          status = 'active',
          credit_limit = 10000.00,
          updated_at = now();
      `, [adminId]);
      console.log(`✅ Admin Wallet Activated with ₹5,000 balance & ₹10,000 credit limit`);
    } catch {
      // Wallet table optional
    }

    // -------------------------------------------------------------
    // SUCCESS SUMMARY
    // -------------------------------------------------------------
    console.log('\n' + '='.repeat(60));
    console.log('\x1b[32m%s\x1b[0m', '🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\x1b[36m%s\x1b[0m', '🔑 SUPER ADMIN CREDENTIALS:');
    console.log(`   Email:    \x1b[1m${adminEmail}\x1b[0m`);
    console.log(`   Password: \x1b[1m${adminPassword}\x1b[0m`);
    console.log(`   Role:     \x1b[1msuper_admin\x1b[0m`);
    console.log('\n\x1b[36m%s\x1b[0m', '🏪 DEFAULT STORE & MENU:');
    console.log(`   Store:    \x1b[1mBodosa Restaurant\x1b[0m (Slug: bodosa)`);
    console.log(`   Items:    \x1b[1m6 Menu Products Ready\x1b[0m`);
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (err) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ Seeding Error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
