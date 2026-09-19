-- Add is_deleted and isdeleted columns to users and profiles
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS isdeleted boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS isdeleted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON public.users(is_deleted);
CREATE INDEX IF NOT EXISTS idx_profiles_is_deleted ON public.profiles(is_deleted);
