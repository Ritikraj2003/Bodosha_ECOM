'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuthStore } from '../store';
import { authService } from '../services/auth-service';
import { sendSignupOtp, verifySignupOtp } from '@/features/cit-student/actions';
import { setupDeliveryAccount, setupAdminAccount, confirmSignupEmail, isEmailRegistered, createUserAccount } from '@/features/auth/actions';
import { getPublicSettings } from '@/features/settings/actions';
import { isCitStudentEmail, isDeliveryEmail, isAdminEmail, isOwnerEmail } from '@/config/auth-access';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import { showToast } from '@/components/shared/Toast';
import { Loader2, Check, Clock, XCircle, ArrowLeft, Mail, Bike } from 'lucide-react';

const COUNTDOWN_SECONDS = 300;

type AccountType = 'student' | 'delivery' | 'admin';

const accountTypes: { value: AccountType; label: string; desc: string; emoji: string }[] = [
  { value: 'student', label: 'Student', desc: 'Create an account to order food', emoji: '🎓' },
  { value: 'delivery', label: 'Delivery Partner', desc: 'Deliver food and earn money', emoji: '🛵' },
  { value: 'admin', label: 'Administrator', desc: 'Manage the store dashboard', emoji: '⚙️' },
];

export default function SignupForm() {
  const publicSettings = usePublicSettings();
  const [step, setStep] = useState<'email' | 'otp' | 'account'>('email');
  const [accountType, setAccountType] = useState<AccountType>('student');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [vehicleType, setVehicleType] = useState('bike');
  const [licensePlate, setLicensePlate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [isCitEmail, setIsCitEmail] = useState(false);
  const timerRef = useRef(0);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = 0;
  }

  useEffect(() => {
    if (countdown > 0) {
      timerRef.current = window.setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { clearTimer(); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return clearTimer;
  }, [countdown]);

  function formatCountdown(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async function handleSendOtp() {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail.includes('@')) { showToast('Enter a valid email'); return; }
    const publicConfig = await getPublicSettings().catch(() => null);
    const deliveryEmails = publicConfig?.deliveryEmails ?? publicSettings.deliveryEmails;
    const adminEmails = publicConfig?.adminEmails ?? publicSettings.adminEmails;
    const ownerEmail = publicConfig?.ownerEmail ?? publicSettings.ownerEmail;
    if (accountType === 'delivery' && !isDeliveryEmail(normalizedEmail, deliveryEmails)) { showToast('This email is not approved for delivery partners'); return; }
    if (accountType === 'admin' && !isAdminEmail(normalizedEmail, adminEmails) && !isOwnerEmail(normalizedEmail, ownerEmail)) { showToast('This email is not approved for admin access'); return; }
    setSending(true);
    setDevOtp(null);
    const existsCheck = await isEmailRegistered(normalizedEmail).catch(() => null);
    if (existsCheck?.registered) {
      setSending(false);
      showToast('This email is already registered. Please sign in instead.');
      return;
    }
    const res = await sendSignupOtp(normalizedEmail);
    setEmail(normalizedEmail);
    setSending(false);
    if (res.success) {
      setStep('otp');
      setCountdown(COUNTDOWN_SECONDS);
      setIsCitEmail(accountType === 'student' && isCitStudentEmail(normalizedEmail));
      showToast('OTP sent to your email');
      if ('devOtp' in res && res.devOtp) setDevOtp(res.devOtp as string);
    } else {
      showToast(res.error ?? 'Failed to send OTP');
    }
  }

  async function handleVerify() {
    if (!otp || otp.length !== 6) { showToast('Enter the 6-digit OTP'); return; }
    setVerifying(true);
    const res = await verifySignupOtp(email, otp);
    setVerifying(false);
    if (res.success) {
      setStep('account');
      showToast('Email verified!');
    } else {
      showToast(res.error ?? 'Verification failed');
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setError('Phone number is required');
      return;
    }
    if (!/^[0-9]{10}$/.test(cleanPhone)) {
      setError('Phone number must be exactly 10 digits (0-9)');
      return;
    }
    setLoading(true);
    let created: { id: string } | null = null;
    let err: string | null = null;
    try {
      const res = await createUserAccount({
        email,
        password,
        fullName,
        phone: cleanPhone,
      });
      created = res.user;
      err = res.error;
    } catch {
      setError('Account creation failed. Please try again.');
      setLoading(false);
      return;
    }
    setLoading(false);
    if (err) { setError(err); return; }
    if (!created) { setError('Check your email for a confirmation link.'); return; }

    if (created.id) {
      await confirmSignupEmail(created.id).catch(() => null);
    }

    // Establish an active session immediately so the user isn't forced to
    // sign in again. Email ownership was already proven by the OTP step.
    const { user: activeUser } = await authService.signIn(email, password);
    if (!activeUser) { setError('Account created. Please sign in.'); return; }

    try {
      const supabase = (await import('@/infrastructure/supabase/service')).createServiceClient();
      if (supabase) {
        const profileUpdates: Record<string, unknown> = {
          phone: cleanPhone,
        };
        if (isCitEmail) {
          profileUpdates.is_cit_student = true;
          profileUpdates.student_email = email.toLowerCase();
          profileUpdates.student_verified_at = new Date().toISOString();
        }
        await supabase.from('profiles').update(profileUpdates).eq('id', activeUser.id);
      }
    } catch {}

    useAuthStore.getState().setUser(activeUser);

    if (accountType === 'delivery') {
      const formData = new FormData();
      formData.set('vehicleType', vehicleType);
      formData.set('licensePlate', licensePlate);
      formData.set('phone', cleanPhone);
      const result = await setupDeliveryAccount(formData);
      if (result.error) { setError(result.error); return; }
      window.location.href = result.redirect ?? '/dashboard/delivery';
      return;
    }

    if (accountType === 'admin') {
      const formData = new FormData();
      formData.set('phone', cleanPhone);
      let result: { error: string | null; redirect: string | null };
      try {
        result = await setupAdminAccount(formData);
      } catch {
        setError('Could not finish setting up your account. Please try again.');
        return;
      }
      if (result.error) { setError(result.error); return; }
      window.location.href = result.redirect ?? '/admin';
      return;
    }

    window.location.href = '/';
  }

  if (step === 'account') {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-zcard rounded-xl shadow-z p-8">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setStep('otp')} className="p-1 rounded-lg hover:bg-zgray text-ztext-light transition-colors">
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-xl font-bold text-ztext">Create account</h1>
          </div>
          <p className="text-ztext-light text-sm mb-6">
            Email <span className="font-medium text-ztext">{email}</span> verified {isCitEmail && <span className="text-zgreen">✓ CIT</span>}
          </p>

          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ztext mb-1.5">
                Full name <span className="text-zred">*</span>
              </label>
              <input type="text" className="input-z w-full" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-ztext mb-1.5">
                Phone number <span className="text-zred">*</span>
              </label>
              <input
                type="tel"
                className="input-z w-full"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                required
                maxLength={10}
                pattern="[0-9]{10}"
                inputMode="numeric"
              />
            </div>
            {accountType === 'delivery' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-ztext mb-1.5">Vehicle type</label>
                  <select className="input-z w-full" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                    <option value="bike">Bike</option>
                    <option value="scooter">Scooter</option>
                    <option value="car">Car</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ztext mb-1.5">License plate <span className="text-ztext-lighter">(optional)</span></label>
                  <input type="text" className="input-z w-full" placeholder="e.g. AS01 AB 1234" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-ztext mb-1.5">Password</label>
              <input type="password" className="input-z w-full" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            {typeof error === 'string' && error && <p className="text-sm text-zred">{error}</p>}
            <button type="submit" className="button-z button-z-primary w-full h-12 text-sm flex items-center justify-center gap-2" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-zcard rounded-xl shadow-z p-8">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setStep('email')} className="p-1 rounded-lg hover:bg-zgray text-ztext-light transition-colors">
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-xl font-bold text-ztext">Verify your email</h1>
          </div>
          <p className="text-ztext-light text-sm mb-6">
            We sent an OTP to <span className="font-medium text-ztext">{email}</span>
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ztext mb-1.5">OTP</label>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                className="input-z w-full font-mono tracking-widest text-center text-lg"
                maxLength={6}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
              />
            </div>

            <button onClick={handleVerify} disabled={verifying || otp.length !== 6}
              className="button-z button-z-primary w-full h-12 text-sm flex items-center justify-center gap-2"
            >
              {verifying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {verifying ? 'Verifying...' : 'Verify email'}
            </button>

            <div className="flex items-center justify-between">
              {countdown > 0 ? (
                <div className="flex items-center gap-1 text-xs text-ztext-lighter">
                  <Clock size={12} />
                  Resend in {formatCountdown(countdown)}
                </div>
              ) : (
                <button onClick={handleSendOtp} disabled={sending}
                  className="text-xs text-zred hover:underline flex items-center gap-1"
                >
                  {sending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                  Resend OTP
                </button>
              )}
            </div>

            {devOtp && process.env.NODE_ENV === 'development' && (
              <p className="text-xs text-center text-ztext-lighter font-mono mt-2">Dev OTP: {devOtp}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-zcard rounded-xl shadow-z p-8">
        <h1 className="text-2xl font-bold text-ztext mb-1">Create account</h1>
        <p className="text-ztext-light text-sm mb-6">Join Dilip Da and start ordering</p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {accountTypes.map((t) => (
              <button key={t.value} type="button" onClick={() => setAccountType(t.value)}
                className={`text-left p-3 rounded-xl border-2 transition-all ${accountType === t.value ? 'border-zred bg-red-500/10' : 'border-zborder hover:border-ztext-light'}`}>
                <div className="text-xl">{t.emoji}</div>
                <div className="font-semibold text-ztext text-sm mt-1">{t.label}</div>
                <div className="text-xs text-ztext-light">{t.desc}</div>
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-ztext mb-1.5">Email</label>
            <input type="email" className="input-z w-full" placeholder="youremail@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendOtp(); }} />
          </div>
          <button onClick={handleSendOtp} disabled={sending || !email.trim()}
            className="button-z button-z-primary w-full h-12 text-sm flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : accountType === 'delivery' ? <Bike size={16} /> : <Mail size={16} />}
            {sending ? 'Sending OTP...' : 'Send OTP'}
          </button>
        </div>

        <p className="text-center text-sm text-ztext-light mt-6">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-semibold text-zred">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
