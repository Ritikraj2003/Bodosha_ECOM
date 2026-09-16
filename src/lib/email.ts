import nodemailer from 'nodemailer';
import { orderTypeLabel } from '@/features/orders/types';
import { getSetting } from '@/lib/settings';

let transporterCache: { key: string; transporter: nodemailer.Transporter } | null = null;

async function smtpConfig(): Promise<{ host: string; port: number; user: string; pass: string; from: string } | null> {
  const host = (await getSetting('smtp_host')) || process.env.SMTP_HOST || '';
  const user = (await getSetting('smtp_user')) || process.env.SMTP_USER || '';
  const pass = (await getSetting('smtp_pass')) || process.env.SMTP_PASS || '';
  const port = Number((await getSetting('smtp_port')) || process.env.SMTP_PORT || '587');
  const from = (await getSetting('smtp_from')) || process.env.SMTP_FROM || 'noreply@dilipda.com';
  if (!host || !user || !pass) return null;
  return { host, port, user, pass, from };
}

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  const cfg = await smtpConfig();
  if (!cfg) return null;
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (transporterCache && transporterCache.key === key) return transporterCache.transporter;

  transporterCache = {
    key,
    transporter: nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
    }),
  };
  return transporterCache.transporter;
}

export async function sendOtpEmail(to: string, otp: string): Promise<boolean> {
  const t = await getTransporter();

  if (!t) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV EMAIL] To: ${to}, OTP: ${otp}`);
      return true;
    }
    return false;
  }

  try {
    const cfg = await smtpConfig();
    await t.sendMail({
      from: cfg?.from || 'noreply@dilipda.com',
      to,
      subject: 'Your CIT Student Verification OTP',
      text: `Your OTP for CIT student verification is: ${otp}\n\nThis OTP expires in 10 minutes.\n\n- Dilip Da`,
      html: `<p>Your OTP for CIT student verification is:</p><h2>${otp}</h2><p>This OTP expires in <strong>10 minutes</strong>.</p><p>- Dilip Da</p>`,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendPasswordResetLinkEmail(to: string, resetLink: string): Promise<boolean> {
  if (!to || !resetLink) return false;
  const t = await getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV EMAIL] Password reset link for ${to}: ${resetLink}`);
      return true;
    }
    return false;
  }

  try {
    const cfg = await smtpConfig();
    await t.sendMail({
      from: cfg?.from || 'noreply@dilipda.com',
      to,
      subject: 'Reset your Dilip Da password',
      text: `We received a request to reset your password for your Dilip Da account.\n\nClick the link below to set a new password:\n${resetLink}\n\nThis link will expire in 24 hours. If you did not request a password reset, you can safely ignore this email.\n\n- Dilip Da Team`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #eaeaea;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #EF4444; font-size: 24px; margin: 0; font-weight: 800;">Dilip Da</h1>
          </div>
          <h2 style="color: #111827; font-size: 18px; margin-bottom: 12px;">Reset your password</h2>
          <p style="color: #4B5563; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">
            We received a request to reset the password for your Dilip Da account (<strong>${to}</strong>). Click the button below to choose a new password:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetLink}" style="background-color: #EF4444; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
          <p style="color: #9CA3AF; font-size: 11px; margin: 0;">
            This link will expire in 24 hours. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('Failed to send password reset email via SMTP:', err);
    return false;
  }
}

export async function sendDeliveryOtpEmail(to: string, otp: string, trackingCode: string): Promise<boolean> {
  if (!to) return false;
  const t = await getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV EMAIL] To: ${to}, Delivery OTP for ${trackingCode}: ${otp}`);
      return true;
    }
    return false;
  }

  try {
    const cfg = await smtpConfig();
    await t.sendMail({
      from: cfg?.from || 'noreply@dilipda.com',
      to,
      subject: `Delivery OTP — Order ${trackingCode}`,
      text: `Your delivery OTP for order ${trackingCode} is: ${otp}\n\nTell this code to your delivery partner to confirm delivery.\nThis OTP expires in 5 minutes.\n\n- Dilip Da`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#EF4444">Delivery confirmation OTP</h2>
          <p>Your delivery OTP for order <strong>${trackingCode}</strong> is:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111">${otp}</p>
          <p>Tell this code to your delivery partner to confirm your delivery.</p>
          <p style="font-size:12px;color:#777">This OTP expires in <strong>5 minutes</strong>.</p>
          <p>- Dilip Da</p>
        </div>
      `,
    });
    return true;
  } catch {
    return false;
  }
}

interface OrderNotificationInfo {
  trackingCode: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  paymentMethod: string;
  address: string;
  customerName: string | null;
  customerPhone: string | null;
  orderType?: string | null;
}

export async function sendOrderNotificationEmail(to: string, order: OrderNotificationInfo): Promise<boolean> {
  if (!to) return false;
  const t = await getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV EMAIL] Order notification for ${order.trackingCode}`);
      return true;
    }
    return false;
  }

  const itemsHtml = order.items.map((i) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${i.name}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">₹${i.price}</td></tr>`).join('');

  try {
    const cfg = await smtpConfig();
    await t.sendMail({
      from: cfg?.from || 'noreply@dilipda.com',
      to,
      subject: `🆕 New Order — ${order.trackingCode}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#EF4444">🆕 New Order Received</h2>
          <p><strong>Tracking:</strong> ${order.trackingCode}</p>
          <p><strong>Customer:</strong> ${order.customerName || 'Guest'}</p>
          <p><strong>Phone:</strong> ${order.customerPhone || 'N/A'}</p>
          <p><strong>Payment:</strong> ${order.paymentMethod.toUpperCase()}</p>
          ${order.orderType ? `<p><strong>Order Type:</strong> ${orderTypeLabel(order.orderType)}</p>` : ''}
          <p><strong>Delivery:</strong> ${order.address}</p>
          <table style="width:100%;border-collapse:collapse;margin:12px 0">
            <thead><tr style="background:#f5f5f5"><th style="padding:8px;text-align:left">Item</th><th style="padding:8px;text-align:center">Qty</th><th style="padding:8px;text-align:right">Price</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <p style="font-size:18px;font-weight:bold;text-align:right">Total: ₹${order.total}</p>
        </div>
      `,
    });
    return true;
  } catch {
    return false;
  }
}
