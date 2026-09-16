-- ============================================================================
-- Allow hard-deleting products that have order history.
-- order_items stores a snapshot of product_name/price, so past orders stay
-- readable even after the product row is removed. The FK no longer restricts
-- deletion, but sets product_id to NULL instead.
--
-- NOTE: Run this in the Supabase Dashboard -> SQL Editor to apply.
-- ============================================================================

alter table public.order_items
  alter column product_id drop not null,
  drop constraint order_items_product_id_fkey,
  add constraint order_items_product_id_fkey
    foreign key (product_id) references public.products(id) on delete set null;