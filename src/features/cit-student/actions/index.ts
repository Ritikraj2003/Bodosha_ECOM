'use server';

import { query } from '@/infrastructure/db';
import { getServerSession } from '@/features/auth/actions';
import { sendOtpEmail } from '@/lib/email';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { createHash, randomInt } from 'node:crypto';

const CIT_DOMAIN = '@cit.ac.in';
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

export async function getCitStudentStatus() {
  const { user } = await getServerSession();
  if (!user) return { status: null, error: 'Not authenticated' };

  const isCitDomain = user.email.toLowerCase().endsWith(CIT_DOMAIN);

  try {
    const res = await query(
      'SELECT is_cit_student, student_email, student_verified_at FROM public.profiles WHERE id = $1',
      [user.id]
    );
    const data = res.rows[0];

    if (isCitDomain && (!data || !data.is_cit_student)) {
      await query(`
        UPDATE public.profiles
        SET is_cit_student = true, student_email = $1, student_verified_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [user.email.toLowerCase(), user.id]);
    }

    return {
      status: {
        isVerified: isCitDomain || !!data?.is_cit_student,
        studentEmail: data?.student_email ?? null,
        verifiedAt: data?.student_verified_at ?? null,
      },
      error: null,
    };
  } catch (err: any) {
    console.error('getCitStudentStatus error:', err);
    return { status: null, error: err.message };
  }
}

export async function sendCitOtp(email: string) {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  if (!email?.toLowerCase().endsWith(CIT_DOMAIN)) {
    return { success: false, error: 'Only @cit.ac.in email addresses are accepted' };
  }

  const rlKey = rateLimitKey('cit-otp-send', user.id);
  const rl = await rateLimit(rlKey, { interval: 3600_000, maxRequests: 5 });
  if (!rl.success) {
    return { success: false, error: 'Too many OTP requests. Try again later.' };
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

  try {
    await query(`
      INSERT INTO public.cit_otp_requests (user_id, email, otp_hash, expires_at, created_at, requested_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [user.id, email.toLowerCase().trim(), otpHash, expiresAt]);
  } catch (e: any) {
    console.error('sendCitOtp insert error:', e);
    return { success: false, error: 'Failed to record OTP request' };
  }

  const sent = await sendOtpEmail(email, otp);
  if (!sent) {
    if (process.env.NODE_ENV === 'development') {
      return { success: true, devOtp: otp };
    }
    return { success: false, error: 'Failed to send OTP email' };
  }

  return { success: true };
}

export async function verifyCitOtp(email: string, otp: string) {
  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  if (!email?.toLowerCase().endsWith(CIT_DOMAIN)) {
    return { success: false, error: 'Invalid email address' };
  }

  if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
    return { success: false, error: 'Invalid OTP format' };
  }

  try {
    const res = await query(`
      SELECT * FROM public.cit_otp_requests
      WHERE user_id = $1 AND email = $2 AND verified_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1;
    `, [user.id, email.toLowerCase().trim()]);

    if (res.rows.length === 0) {
      return { success: false, error: 'No OTP request found. Request a new OTP.' };
    }

    const request = res.rows[0];

    if (new Date(request.expires_at) < new Date()) {
      return { success: false, error: 'OTP has expired. Request a new one.' };
    }

    if (request.attempts >= MAX_ATTEMPTS) {
      return { success: false, error: 'Too many failed attempts. Request a new OTP.' };
    }

    await query('UPDATE public.cit_otp_requests SET attempts = attempts + 1 WHERE id = $1', [request.id]);

    const otpHash = hashOtp(otp);
    if (request.otp_hash !== otpHash) {
      return { success: false, error: 'Invalid OTP' };
    }

    await query('UPDATE public.cit_otp_requests SET verified_at = NOW() WHERE id = $1', [request.id]);

    await query(`
      UPDATE public.profiles
      SET is_cit_student = true, student_email = $1, student_verified_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [email.toLowerCase().trim(), user.id]);

    return { success: true };
  } catch (e: any) {
    console.error('verifyCitOtp error:', e);
    return { success: false, error: e.message || 'OTP verification failed' };
  }
}

export async function sendSignupOtp(email: string) {
  if (!email?.trim() || !email.includes('@')) {
    return { success: false, error: 'Invalid email address' };
  }

  const normalizedEmail = email.toLowerCase().trim();

  const rlKey = rateLimitKey('signup-otp-send', normalizedEmail);
  const rl = await rateLimit(rlKey, { interval: 3600_000, maxRequests: 10 });
  if (!rl.success) {
    return { success: false, error: 'Too many OTP requests. Try again later.' };
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

  try {
    await query(`
      INSERT INTO public.cit_otp_requests (email, otp_hash, expires_at, created_at, requested_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [normalizedEmail, otpHash, expiresAt]);
  } catch (insertError: any) {
    console.error('sendSignupOtp insert error:', insertError);
    return { success: false, error: 'Failed to record OTP request' };
  }

  const sent = await sendOtpEmail(email, otp);
  if (!sent) {
    if (process.env.NODE_ENV === 'development') {
      return { success: true, devOtp: otp };
    }
    return { success: false, error: 'Failed to send OTP email' };
  }

  return { success: true };
}

export async function verifySignupOtp(email: string, otp: string) {
  if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
    return { success: false, error: 'Invalid OTP format' };
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const res = await query(`
      SELECT * FROM public.cit_otp_requests
      WHERE email = $1 AND verified_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1;
    `, [normalizedEmail]);

    if (res.rows.length === 0) {
      return { success: false, error: 'No OTP request found. Request a new OTP.' };
    }

    const request = res.rows[0];

    if (new Date(request.expires_at) < new Date()) {
      return { success: false, error: 'OTP has expired. Request a new one.' };
    }

    if (request.attempts >= MAX_ATTEMPTS) {
      return { success: false, error: 'Too many failed attempts. Request a new OTP.' };
    }

    await query('UPDATE public.cit_otp_requests SET attempts = attempts + 1 WHERE id = $1', [request.id]);

    const otpHash = hashOtp(otp);
    if (request.otp_hash !== otpHash) {
      return { success: false, error: 'Invalid OTP' };
    }

    await query('UPDATE public.cit_otp_requests SET verified_at = NOW() WHERE id = $1', [request.id]);

    return { success: true, isCit: normalizedEmail.endsWith(CIT_DOMAIN) };
  } catch (e: any) {
    console.error('verifySignupOtp error:', e);
    return { success: false, error: e.message || 'OTP verification failed' };
  }
}
