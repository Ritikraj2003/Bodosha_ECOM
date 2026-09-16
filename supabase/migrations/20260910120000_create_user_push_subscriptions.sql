-- Migration: Create user_push_subscriptions for Native Web Push (VAPID) notifications
-- Allows targeting individual users across multiple devices (mobile, laptop) with duplicate endpoint protection.

CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by user_id for dispatching notifications to a user's devices
CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON public.user_push_subscriptions(user_id);

-- Enable Row Level Security
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow users to view, insert, update and delete their own subscriptions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_push_subscriptions' 
        AND policyname = 'Users can manage own push subscriptions'
    ) THEN
        CREATE POLICY "Users can manage own push subscriptions"
            ON public.user_push_subscriptions
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
