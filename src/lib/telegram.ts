import { getSetting } from '@/lib/settings';

interface InlineButton {
  text: string;
  callback_data: string;
}

interface TelegramMessageResult {
  message_id?: number;
  chat?: { id: number };
}

let telegramConfigCache: { token: string; chatId: string; fetchedAt: number } | null = null;
const CONFIG_TTL_MS = 10_000;

async function getTelegramConfig(): Promise<{ token: string | null; chatId: string | null }> {
  if (telegramConfigCache && Date.now() - telegramConfigCache.fetchedAt < CONFIG_TTL_MS) {
    return { token: telegramConfigCache.token, chatId: telegramConfigCache.chatId };
  }
  const enabled = (await getSetting('telegram_enabled')) ?? 'true';
  const token = enabled === 'false' ? null : ((await getSetting('telegram_bot_token')) || process.env.TELEGRAM_BOT_TOKEN || null);
  const chatId = enabled === 'false' ? null : ((await getSetting('telegram_chat_id')) || process.env.TELEGRAM_CHAT_ID || null);
  telegramConfigCache = { token: token ?? '', chatId: chatId ?? '', fetchedAt: Date.now() };
  return { token, chatId };
}

async function callBot(method: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const { token } = await getTelegramConfig();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function sendTelegramMessage(text: string): Promise<TelegramMessageResult | null> {
  const { chatId } = await getTelegramConfig();
  if (!chatId) {
    if (process.env.NODE_ENV === 'development') console.log(`[DEV TELEGRAM] ${text}`);
    return null;
  }
  return callBot('sendMessage', { chat_id: Number(chatId), text, parse_mode: 'HTML' }) as Promise<TelegramMessageResult | null>;
}

export async function sendTelegramMessageWithButtons(
  text: string,
  buttons: InlineButton[][]
): Promise<TelegramMessageResult | null> {
  const { chatId } = await getTelegramConfig();
  if (!chatId) {
    if (process.env.NODE_ENV === 'development') console.log(`[DEV TELEGRAM] ${text}`, buttons);
    return null;
  }
  return callBot('sendMessage', {
    chat_id: Number(chatId),
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  }) as Promise<TelegramMessageResult | null>;
}

export async function sendTelegramPhoto(caption: string, pngBuffer: Buffer, buttons: InlineButton[][] = []) {
  const config = await getTelegramConfig();
  const token = config.token;
  const chatId = config.chatId;
  if (!token || !chatId) {
    if (process.env.NODE_ENV === 'development') console.log(`[DEV TELEGRAM PHOTO] ${caption}`);
    return null;
  }
  try {
    const form = new FormData();
    form.append('chat_id', String(Number(chatId)));
    form.append('photo', new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }), 'pickup-qr.png');
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    if (buttons.length > 0) form.append('reply_markup', JSON.stringify({ inline_keyboard: buttons }));
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form });
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function editTelegramMessage(
  chatId: number,
  messageId: number,
  text: string,
  buttons?: InlineButton[][]
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
  };
  if (buttons) body.reply_markup = { inline_keyboard: buttons };
  else body.reply_markup = { inline_keyboard: [] };
  return callBot('editMessageText', body);
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callBot('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text ?? '',
    show_alert: false,
  });
}

export async function telegramChatId(): Promise<string | number | null> {
  const { chatId } = await getTelegramConfig();
  return chatId ? Number(chatId) : null;
}