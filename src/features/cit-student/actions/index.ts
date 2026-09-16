'use server';

import { createServiceClient } from '@/infrastructure/supabase/service';
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
  const supabase = createServiceClient();
  if (!supabase) return { status: null, error: 'Service not configured' };

  const { user } = await getServerSession();
  if (!user) return { status: null, error: 'Not authenticated' };

  const isCitDomain = user.email.toLowerCase().endsWith(CIT_DOMAIN);

  const { data } = await supabase
    .from('profiles')
    .select('is_cit_student, student_email, student_verified_at')
    .eq('id', user.id)
    .maybeSingle();

  if (isCitDomain && (!data || !data.is_cit_student)) {
    await supabase.from('profiles').update({
      is_cit_student: true,
      student_email: user.email.toLowerCase(),
      student_verified_at: new Date().toISOString(),
    }).eq('id', user.id);
  }

  return {
    status: {
      isVerified: isCitDomain || !!data?.is_cit_student,
      studentEmail: data?.student_email ?? null,
      verifiedAt: data?.student_verified_at ?? null,
    },
    error: null,
  };
}

export async function sendCitOtp(email: string) {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  if (!email?.toLowerCase().endsWith(CIT_DOMAIN)) {
    return { success: false, error: 'Only @cit.ac.in email addresses are accepted' };
  }

  const rlKey = rateLimitKey('cit-otp-send', user.id);
  const rl = await rateLimit(rlKey, { interval: 3600_000, maxRequests: 3 });
  if (!rl.success) {
    return { success: false, error: 'Too many OTP requests. Try again later.' };
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

  const { error: insertError } = await supabase.from('cit_otp_requests').insert({
    user_id: user.id,
    email: email.toLowerCase(),
    otp_hash: otpHash,
    expires_at: expiresAt,
  });

  if (insertError) return { success: false, error: 'Failed to send OTP' };

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
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  const { user } = await getServerSession();
  if (!user) return { success: false, error: 'Not authenticated' };

  if (!email?.toLowerCase().endsWith(CIT_DOMAIN)) {
    return { success: false, error: 'Invalid email address' };
  }

  if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
    return { success: false, error: 'Invalid OTP format' };
  }

  const { data: requests, error: fetchError } = await supabase
    .from('cit_otp_requests')
    .select('*')
    .eq('user_id', user.id)
    .eq('email', email.toLowerCase())
    .is('verified_at', null)
    .order('requested_at', { ascending: false })
    .limit(1);

  if (fetchError || !requests || requests.length === 0) {
    return { success: false, error: 'No OTP request found. Request a new OTP.' };
  }

  const request = requests[0];

  if (new Date(request.expires_at) < new Date()) {
    return { success: false, error: 'OTP has expired. Request a new one.' };
  }

  if (request.attempts >= MAX_ATTEMPTS) {
    return { success: false, error: 'Too many failed attempts. Request a new OTP.' };
  }

  await supabase
    .from('cit_otp_requests')
    .update({ attempts: request.attempts + 1 })
    .eq('id', request.id);

  const otpHash = hashOtp(otp);
  if (request.otp_hash !== otpHash) {
    return { success: false, error: 'Invalid OTP' };
  }

  const now = new Date().toISOString();

  await supabase
    .from('cit_otp_requests')
    .update({ verified_at: now })
    .eq('id', request.id);

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      is_cit_student: true,
      student_email: email.toLowerCase(),
      student_verified_at: now,
    })
    .eq('id', user.id);

  if (profileError) return { success: false, error: 'Failed to update profile' };

  return { success: true };
}

export async function sendSignupOtp(email: string) {
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  if (!email?.trim() || !email.includes('@')) {
    return { success: false, error: 'Invalid email address' };
  }

  const normalizedEmail = email.toLowerCase().trim();

  const rlKey = rateLimitKey('signup-otp-send', normalizedEmail);
  const rl = await rateLimit(rlKey, { interval: 3600_000, maxRequests: 3 });
  if (!rl.success) {
    return { success: false, error: 'Too many OTP requests. Try again later.' };
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

  const { error: insertError } = await supabase.from('cit_otp_requests').insert({
    email: normalizedEmail,
    otp_hash: otpHash,
    expires_at: expiresAt,
  });

  if (insertError) {
    if (process.env.NODE_ENV === 'development') {
      console.error('sendSignupOtp insert error:', insertError);
    }
    return { success: false, error: 'Failed to send OTP' };
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
  const supabase = createServiceClient();
  if (!supabase) return { success: false, error: 'Service not configured' };

  if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
    return { success: false, error: 'Invalid OTP format' };
  }

  const normalizedEmail = email.toLowerCase().trim();

  const { data: requests, error: fetchError } = await supabase
    .from('cit_otp_requests')
    .select('*')
    .eq('email', normalizedEmail)
    .is('verified_at', null)
    .order('requested_at', { ascending: false })
    .limit(1);

  if (fetchError || !requests || requests.length === 0) {
    return { success: false, error: 'No OTP request found. Request a new OTP.' };
  }

  const request = requests[0];

  if (new Date(request.expires_at) < new Date()) {
    return { success: false, error: 'OTP has expired. Request a new one.' };
  }

  if (request.attempts >= MAX_ATTEMPTS) {
    return { success: false, error: 'Too many failed attempts. Request a new OTP.' };
  }

  await supabase
    .from('cit_otp_requests')
    .update({ attempts: request.attempts + 1 })
    .eq('id', request.id);

  const otpHash = hashOtp(otp);
  if (request.otp_hash !== otpHash) {
    return { success: false, error: 'Invalid OTP' };
  }

  await supabase
    .from('cit_otp_requests')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', request.id);

  return { success: true, isCit: normalizedEmail.endsWith(CIT_DOMAIN) };
}
