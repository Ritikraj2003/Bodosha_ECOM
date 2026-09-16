import { describe, it, expect } from 'vitest';
import { isOwnerEmail, isAdminEmail } from '@/config/auth-access';

describe('Store Owner (Dilip Da) Read-Only Access & Permissions', () => {
  const STORE_OWNER_EMAIL = 'dilipda@cit.ac.in';
  const ADMIN_EMAILS = ['admin@cit.ac.in', 'superadmin@cit.ac.in'];

  describe('isOwnerEmail access gate', () => {
    it('correctly matches configured store owner email', () => {
      expect(isOwnerEmail('dilipda@cit.ac.in', STORE_OWNER_EMAIL)).toBe(true);
      expect(isOwnerEmail('DILIPDA@CIT.AC.IN', STORE_OWNER_EMAIL)).toBe(true);
      expect(isOwnerEmail('  dilipda@cit.ac.in  ', STORE_OWNER_EMAIL)).toBe(true);
    });

    it('correctly matches multiple configured store owner emails (comma/newline separated or array)', () => {
      const MULTIPLE_OWNERS = 'dilipda@cit.ac.in, secondowner@cit.ac.in \n thirdowner@cit.ac.in;fourthowner@cit.ac.in';
      expect(isOwnerEmail('dilipda@cit.ac.in', MULTIPLE_OWNERS)).toBe(true);
      expect(isOwnerEmail('secondowner@cit.ac.in', MULTIPLE_OWNERS)).toBe(true);
      expect(isOwnerEmail('THIRDOWNER@cit.ac.in', MULTIPLE_OWNERS)).toBe(true);
      expect(isOwnerEmail('fourthowner@cit.ac.in', MULTIPLE_OWNERS)).toBe(true);
      expect(isOwnerEmail('other@cit.ac.in', MULTIPLE_OWNERS)).toBe(false);
      expect(isOwnerEmail('secondowner@cit.ac.in', ['dilipda@cit.ac.in', 'secondowner@cit.ac.in'])).toBe(true);
    });

    it('rejects non-owner emails', () => {
      expect(isOwnerEmail('student@cit.ac.in', STORE_OWNER_EMAIL)).toBe(false);
      expect(isOwnerEmail('admin@cit.ac.in', STORE_OWNER_EMAIL)).toBe(false);
      expect(isOwnerEmail('', STORE_OWNER_EMAIL)).toBe(false);
      expect(isOwnerEmail('dilipda@cit.ac.in', null)).toBe(false);
      expect(isOwnerEmail('dilipda@cit.ac.in', undefined)).toBe(false);
    });
  });

  describe('Owner vs Admin separation of duties', () => {
    it('ensures owner email is recognized as owner and admin emails as admin', () => {
      const userOwner = 'dilipda@cit.ac.in';
      const userAdmin = 'admin@cit.ac.in';

      expect(isOwnerEmail(userOwner, STORE_OWNER_EMAIL)).toBe(true);
      expect(isAdminEmail(userOwner, ADMIN_EMAILS)).toBe(false);

      expect(isOwnerEmail(userAdmin, STORE_OWNER_EMAIL)).toBe(false);
      expect(isAdminEmail(userAdmin, ADMIN_EMAILS)).toBe(true);
    });
  });

  describe('In-Store counter history statistics calculation', () => {
    const mockInStoreOrders = [
      { id: '1', total: 150, payment_method: 'cash', payment_status: 'confirmed', order_type: 'in_store', created_at: '2026-08-31T10:00:00Z' },
      { id: '2', total: 300, payment_method: 'upi', payment_status: 'confirmed', order_type: 'takeaway', created_at: '2026-08-31T11:00:00Z' },
      { id: '3', total: 200, payment_method: 'razorpay', payment_status: 'confirmed', order_type: 'in_store', created_at: '2026-08-31T12:00:00Z' },
      { id: '4', total: 100, payment_method: 'cash', payment_status: 'pending', order_type: 'in_store', created_at: '2026-08-31T13:00:00Z' },
    ];

    it('calculates total revenue from confirmed orders only', () => {
      const confirmed = mockInStoreOrders.filter((o) => o.payment_status === 'confirmed');
      const totalRevenue = confirmed.reduce((sum, o) => sum + o.total, 0);
      expect(totalRevenue).toBe(650);
    });

    it('calculates cash vs online revenue correctly', () => {
      const confirmed = mockInStoreOrders.filter((o) => o.payment_status === 'confirmed');
      const cashRevenue = confirmed.filter((o) => o.payment_method === 'cash').reduce((sum, o) => sum + o.total, 0);
      const onlineRevenue = confirmed.filter((o) => o.payment_method === 'upi' || o.payment_method === 'razorpay').reduce((sum, o) => sum + o.total, 0);

      expect(cashRevenue).toBe(150);
      expect(onlineRevenue).toBe(500);
      expect(cashRevenue + onlineRevenue).toBe(650);
    });
  });

  describe('Products packet requirements display for Owner', () => {
    it('correctly formats packaging breakdown for products', () => {
      const product1 = { name: 'Special Chicken Thali', packaging_big_qty: 1, packaging_small_qty: 1 };
      const product2 = { name: 'Veg Thali', packaging_big_qty: 1, packaging_small_qty: 0 };
      const product3 = { name: 'Chicken Gravy', packaging_big_qty: 0, packaging_small_qty: 1 };
      const product4 = { name: 'Water Bottle', packaging_big_qty: 0, packaging_small_qty: 0 };

      const formatPackaging = (p: { packaging_big_qty?: number; packaging_small_qty?: number }) => {
        const big = p.packaging_big_qty ?? 0;
        const small = p.packaging_small_qty ?? 0;
        if (big === 0 && small === 0) return 'None (₹0)';
        return `${big > 0 ? `${big} Big` : ''}${big > 0 && small > 0 ? ' + ' : ''}${small > 0 ? `${small} Small` : ''}`;
      };

      expect(formatPackaging(product1)).toBe('1 Big + 1 Small');
      expect(formatPackaging(product2)).toBe('1 Big');
      expect(formatPackaging(product3)).toBe('1 Small');
      expect(formatPackaging(product4)).toBe('None (₹0)');
    });
  });
});
