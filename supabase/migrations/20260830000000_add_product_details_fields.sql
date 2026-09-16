-- Migration: Add detailed food specification fields to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS servings text,
  ADD COLUMN IF NOT EXISTS pieces text,
  ADD COLUMN IF NOT EXISTS portion_size text,
  ADD COLUMN IF NOT EXISTS included_items text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ingredients text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allergens text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery_time text,
  ADD COLUMN IF NOT EXISTS full_description text;
