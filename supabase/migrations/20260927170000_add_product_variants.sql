-- Migration: Add product variants support (Half / Full portions & customizable pricing)
-- Date: 2026-09-27

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- Create index on has_variants for faster filtering
CREATE INDEX IF NOT EXISTS idx_products_has_variants ON public.products(has_variants);
