-- Add order_type column to orders table
alter table public.orders
  add column if not exists order_type text
  check (order_type in ('room_delivery', 'takeaway', 'dine_in'));

-- Existing orders get null order_type, which preserves backward compatibility
