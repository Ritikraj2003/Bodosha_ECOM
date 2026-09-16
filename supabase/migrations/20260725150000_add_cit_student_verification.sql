-- Add CIT student verification columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_cit_student boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_verified_at timestamptz;

-- CIT OTP verification requests
CREATE TABLE IF NOT EXISTS public.cit_otp_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  email       text not null,
  otp_hash    text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  requested_at timestamptz not null default now(),
  verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cit_otp_user_email ON public.cit_otp_requests(user_id, email);
