-- Migration: Add in_store order_type and cash payment_method support

-- 1. Update orders.order_type check constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IS NULL OR order_type IN ('room_delivery', 'takeaway', 'dine_in', 'in_store'));

-- 2. Update orders.payment_method check constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('razorpay', 'bnpl', 'cod', 'cash', 'upi', 'wallet'));

-- 3. Update payments.payment_method check constraint
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('razorpay', 'bnpl', 'cod', 'cash', 'upi', 'wallet'));
