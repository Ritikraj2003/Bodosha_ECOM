 
const fs = require('fs');
const path = require('path');

async function run() {
  const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
  const env = {};
  envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    }
  });

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Get settings
  const settingsRes = await fetch(`${url}/rest/v1/system_settings`, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
  });
  const settings = await settingsRes.json();
  let token = '';
  for (const row of settings) {
    if (row.key === 'telegram_bot_token') token = row.value;
  }

  // Get URL from command line arguments
  const args = process.argv.slice(2);
  let webhookUrl = args[0] || env.NEXT_PUBLIC_SITE_URL || '';
  if (!webhookUrl) {
    console.error('Error: Please specify the webhook URL as an argument, e.g.: node set-webhook.js https://yourdomain.com');
    return;
  }

  // Append path if not present
  if (!webhookUrl.endsWith('/api/telegram/webhook')) {
    webhookUrl = webhookUrl.replace(/\/$/, '') + '/api/telegram/webhook';
  }

  console.log(`Setting Telegram webhook for bot to: ${webhookUrl}`);
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
  const json = await res.json();
  console.log('Telegram API response:', json);
}
run().catch(console.error);
