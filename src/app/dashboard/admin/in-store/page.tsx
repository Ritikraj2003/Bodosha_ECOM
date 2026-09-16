'use client';

import { useState, useEffect, useTransition, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  Search, Plus, Minus, Trash2, User, Phone, Mail, Banknote,
  CreditCard, CheckCircle2, AlertCircle, ShoppingBag, Loader2,
  RefreshCw, Store, Sparkles, Check, DollarSign, Printer, History,
  TrendingUp, Calendar, FileText, ChevronRight, Filter, UserPlus, X, Clock,
  QrCode,
} from 'lucide-react';
import {
  getInStoreCatalog,
  searchCustomerByPhone,
  createInStoreOrder,
  getInStoreOrdersAndStats,
} from '@/features/orders/actions/in-store';
import { loadRazorpayScript, openRazorpayCheckout } from '@/features/payments/services/razorpay';
import { createRazorpayOrder, verifyRazorpayPayment } from '@/features/payments/actions';
import { PrintableReceipt } from '@/components/admin/PrintableReceipt';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import type { Product, Category } from '@/features/products/types';
import type { CartItem } from '@/features/cart/types';

interface OrderSuccessData {
  orderId: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  orderType?: string;
  total: number;
  subtotal: number;
  taxAmount: number;
  paymentMethod: string;
  items: CartItem[];
  createdAt: string;
}

interface InStoreOrderRecord {
  id: string;
  tracking_code: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  order_type: string | null;
  delivery_address: { address?: string } | null;
  delivery_notes: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  payment_method: string | null;
  payment_status: string;
  status: string;
  created_at: string;
  order_items?: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

interface HistoryStats {
  totalOrders: number;
  totalRevenue: number;
  todayRevenue: number;
  cashRevenue: number;
  onlineRevenue: number;
}

export default function InStorePage() {
  const publicSettings = usePublicSettings();
  const razorpayKey = publicSettings.razorpayKeyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

  // Active Tab
  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');

  // Catalog state
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Customer state
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  // Cart & Order Options state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isTakeaway, setIsTakeaway] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');

  // Payment & Checkout state
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'razorpay' | 'upi'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success receipt modal state
  const [successData, setSuccessData] = useState<OrderSuccessData | null>(null);

  // Printable receipt state
  const [printReceiptData, setPrintReceiptData] = useState<OrderSuccessData | null>(null);

  // History & Revenue state
  const [historyOrders, setHistoryOrders] = useState<InStoreOrderRecord[]>([]);
  const [historyStats, setHistoryStats] = useState<HistoryStats>({
    totalOrders: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    cashRevenue: 0,
    onlineRevenue: 0,
  });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState('all');
  const [historyOrderTypeFilter, setHistoryOrderTypeFilter] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  // History Date & Time Filters state
  const [dateQuickFilter, setDateQuickFilter] = useState<'all' | 'today' | 'yesterday' | 'custom'>('all');
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customFromTime, setCustomFromTime] = useState('01:00');
  const [customToTime, setCustomToTime] = useState('20:00');

  // Order Details modal in history
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<InStoreOrderRecord | null>(null);

  const [, startTransition] = useTransition();

  useEffect(() => {
    fetchCatalog();
  }, []);

  async function fetchCatalog() {
    setLoadingCatalog(true);
    setError(null);
    const res = await getInStoreCatalog();
    if (res.success && res.data) {
      setCategories(res.data.categories);
      setProducts(res.data.products);
    } else {
      setError(res.error || 'Failed to load menu catalog');
    }
    setLoadingCatalog(false);
  }

  // Calculate ISO dates for date/time filters in local timezone
  const getDateRangeParams = useCallback(() => {
    if (dateQuickFilter === 'all') return { fromDate: undefined, toDate: undefined };

    const now = new Date();
    if (dateQuickFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { fromDate: start.toISOString(), toDate: end.toISOString() };
    }

    if (dateQuickFilter === 'yesterday') {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
      const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
      return { fromDate: start.toISOString(), toDate: end.toISOString() };
    }

    if (dateQuickFilter === 'custom') {
      if (!customDate) return { fromDate: undefined, toDate: undefined };
      const [year, month, day] = customDate.split('-').map(Number);
      const [fromH, fromM] = (customFromTime || '00:00').split(':').map(Number);
      const [toH, toM] = (customToTime || '23:59').split(':').map(Number);

      const start = new Date(year, month - 1, day, fromH || 0, fromM || 0, 0, 0);
      const end = new Date(year, month - 1, day, toH ?? 23, toM ?? 59, 59, 999);
      return { fromDate: start.toISOString(), toDate: end.toISOString() };
    }

    return { fromDate: undefined, toDate: undefined };
  }, [dateQuickFilter, customDate, customFromTime, customToTime]);

  const fetchHistory = useCallback(async (p = 1) => {
    setLoadingHistory(true);
    const { fromDate, toDate } = getDateRangeParams();
    const res = await getInStoreOrdersAndStats({
      search: historySearch || undefined,
      paymentMethod: historyPaymentFilter !== 'all' ? historyPaymentFilter : undefined,
      orderType: historyOrderTypeFilter !== 'all' ? historyOrderTypeFilter : undefined,
      fromDate,
      toDate,
      page: p,
      pageSize: 15,
    });
    if (res.success && res.data) {
      setHistoryStats(res.data.stats);
      setHistoryOrders(res.data.orders as unknown as InStoreOrderRecord[]);
      setHistoryPage(res.data.page);
      setHistoryTotalPages(res.data.totalPages);
    }
    setLoadingHistory(false);
  }, [historySearch, historyPaymentFilter, historyOrderTypeFilter, getDateRangeParams]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory(1);  
    }
  }, [activeTab, fetchHistory]);

  // Handle phone number change & customer lookup
  function handlePhoneChange(val: string) {
    setCustomerPhone(val);
    const clean = val.trim().replace(/[^\d+]/g, '');
    if (clean.length >= 5) {
      setSearchingCustomer(true);
      startTransition(async () => {
        const res = await searchCustomerByPhone(clean);
        setSearchingCustomer(false);
        if (res.success && res.data) {
          setIsExistingCustomer(true);
          if (res.data.fullName && !customerName) {
            setCustomerName(res.data.fullName);
          }
          if (res.data.email && !customerEmail) {
            setCustomerEmail(res.data.email);
          }
        } else {
          setIsExistingCustomer(false);
        }
      });
    } else {
      setIsExistingCustomer(false);
    }
  }

  // Filter products by search and category
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())));
      const matchCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  // Cart operations
  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          veg: product.is_vegetarian,
          image: product.image ?? '',
          packagingBigQty: Number(product.packaging_big_qty) || 0,
          packagingSmallQty: Number(product.packaging_small_qty) || 0,
        },
      ];
    });
  }

  function updateQuantity(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((item) => item.id !== id));
  }

  function clearCart() {
    setCart([]);
  }

  // Financial calculations
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const maintenanceFee = subtotal > 0 ? publicSettings.maintenanceFee : 0;

  const isPackagingEnabled = publicSettings.packagingChargeEnabled ?? true;
  const bigPacketPrice = publicSettings.packagingBigPrice ?? 3;
  const smallPacketPrice = publicSettings.packagingSmallPrice ?? 2;

  const totalBigPackets = cart.reduce((sum, item) => sum + (item.packagingBigQty ?? 0) * item.quantity, 0);
  const totalSmallPackets = cart.reduce((sum, item) => sum + (item.packagingSmallQty ?? 0) * item.quantity, 0);

  const packagingCharge = subtotal > 0 && isTakeaway && isPackagingEnabled
    ? (totalBigPackets * bigPacketPrice) + (totalSmallPackets * smallPacketPrice)
    : 0;

  const totalFees = maintenanceFee + packagingCharge;
  const total = subtotal + totalFees;
  const tenderedAmount = Number(cashTendered) || 0;
  const changeDue = tenderedAmount >= total ? tenderedAmount - total : 0;

  // Checkout submit handler - customer information is optional
  async function handleCheckout() {
    setError(null);
    if (cart.length === 0) {
      setError('Please add at least one product to the bill.');
      return;
    }

    const cleanPhone = customerPhone.trim();
    if (cleanPhone && !/^[0-9]{10}$/.test(cleanPhone)) {
      setError('Customer phone number must be exactly 10 digits (0-9)');
      return;
    }

    setPlacing(true);

    const displayName = customerName.trim() || 'Walk-in Customer';
    const displayPhone = cleanPhone || 'N/A';
    const currentOrderType = isTakeaway ? 'takeaway' : 'in_store';

    if (paymentMethod === 'cash') {
      const res = await createInStoreOrder({
        items: cart,
        subtotal,
        taxAmount: totalFees,
        total,
        paymentMethod: 'cash',
        customerPhone: customerPhone.trim() || undefined,
        customerName: customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        notes: orderNotes,
        orderType: currentOrderType,
      });

      setPlacing(false);
      if (res.success && res.data) {
        setSuccessData({
          orderId: res.data.orderId,
          trackingCode: res.data.trackingCode,
          customerName: displayName,
          customerPhone: displayPhone,
          customerEmail: customerEmail.trim() || undefined,
          orderType: currentOrderType,
          total,
          subtotal,
          taxAmount: totalFees,
          paymentMethod: 'Cash',
          items: [...cart],
          createdAt: new Date().toISOString(),
        });
      } else {
        setError(res.error || 'Failed to complete cash checkout.');
      }
      return;
    }

    // UPI Direct flow
    if (paymentMethod === 'upi') {
      const res = await createInStoreOrder({
        items: cart,
        subtotal,
        taxAmount: totalFees,
        total,
        paymentMethod: 'upi',
        customerPhone: customerPhone.trim() || undefined,
        customerName: customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        notes: orderNotes,
        orderType: currentOrderType,
      });

      setPlacing(false);
      if (res.success && res.data) {
        setSuccessData({
          orderId: res.data.orderId,
          trackingCode: res.data.trackingCode,
          customerName: displayName,
          customerPhone: displayPhone,
          customerEmail: customerEmail.trim() || undefined,
          orderType: currentOrderType,
          total,
          subtotal,
          taxAmount: totalFees,
          paymentMethod: 'UPI',
          items: [...cart],
          createdAt: new Date().toISOString(),
        });
      } else {
        setError(res.error || 'Failed to complete UPI checkout.');
      }
      return;
    }

    // Razorpay flow
    if (paymentMethod === 'razorpay') {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !razorpayKey) {
        setError('Razorpay payment gateway is not properly loaded or configured.');
        setPlacing(false);
        return;
      }

      const rzpRes = await createRazorpayOrder(total * 100);
      if (!rzpRes.success) {
        setError(rzpRes.error || 'Failed to initiate Razorpay order.');
        setPlacing(false);
        return;
      }

      openRazorpayCheckout({
        key: razorpayKey,
        amount: rzpRes.data.amount,
        name: 'Dilip Da In-Store Counter',
        description: `Counter Order for ${displayName}`,
        orderId: rzpRes.data.id,
        prefill: { name: displayName, contact: customerPhone.trim() || '', email: customerEmail.trim() || '' },
        onSuccess: async (res) => {
          const verifyRes = await verifyRazorpayPayment(
            res.razorpay_order_id,
            res.razorpay_payment_id,
            res.razorpay_signature
          );

          if (!verifyRes.success) {
            setError('Razorpay payment verification failed.');
            setPlacing(false);
            return;
          }

          const createRes = await createInStoreOrder({
            items: cart,
            subtotal,
            taxAmount: totalFees,
            total,
            paymentMethod: 'razorpay',
            customerPhone: customerPhone.trim() || undefined,
            customerName: customerName.trim() || undefined,
            customerEmail: customerEmail.trim() || undefined,
            notes: orderNotes,
            orderType: currentOrderType,
          });

          setPlacing(false);
          if (createRes.success && createRes.data) {
            setSuccessData({
              orderId: createRes.data.orderId,
              trackingCode: createRes.data.trackingCode,
              customerName: displayName,
              customerPhone: displayPhone,
              customerEmail: customerEmail.trim() || undefined,
              orderType: currentOrderType,
              total,
              subtotal,
              taxAmount: totalFees,
              paymentMethod: 'Online (Razorpay)',
              items: [...cart],
              createdAt: new Date().toISOString(),
            });
          } else {
            setError(createRes.error || 'Payment succeeded but failed to record in-store order.');
          }
        },
        onFailure: (err) => {
          setError(err || 'Payment cancelled');
          setPlacing(false);
        },
      });
    }
  }

  // Reset for Next Customer
  function handleStartNewOrder() {
    setCart([]);
    setIsTakeaway(false);
    setCustomerPhone('');
    setCustomerName('');
    setCustomerEmail('');
    setIsExistingCustomer(false);
    setOrderNotes('');
    setCashTendered('');
    setError(null);
    setSuccessData(null);
  }

  // Helper to open printable receipt from saved history order
  function openReceiptFromHistory(order: InStoreOrderRecord) {
    const receiptItems: CartItem[] = (order.order_items ?? []).map((i) => ({
      id: i.id,
      name: i.product_name,
      price: i.unit_price,
      quantity: i.quantity,
      veg: false,
      image: '',
    }));

    setPrintReceiptData({
      orderId: order.id,
      trackingCode: order.tracking_code,
      customerName: order.customer_name ?? 'Walk-in Customer',
      customerPhone: order.customer_phone ?? 'N/A',
      customerEmail: order.customer_email ?? undefined,
      orderType: order.order_type ?? 'in_store',
      total: Number(order.total),
      subtotal: Number(order.subtotal ?? order.total),
      taxAmount: Number(order.tax_amount ?? 0),
      paymentMethod: order.payment_method ? order.payment_method.toUpperCase() : 'CASH',
      items: receiptItems,
      createdAt: order.created_at,
    });
  }

  const fmt = (n: number) => '₹' + Number(n).toLocaleString('en-IN');

  return (
    <div className="space-y-6">
      {/* Header bar & Sub-nav Tabs */}
      <div className="bg-zcard p-4 rounded-xl border border-zborder shadow-z space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zred/10 flex items-center justify-center text-zred shrink-0">
              <Store size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ztext flex items-center gap-2">
                In Store Counter
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Active Counter
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* History Button (Repositioned to the left of + Customer Info in the same row) */}
            <button
              onClick={() => setActiveTab(activeTab === 'history' ? 'pos' : 'history')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-colors text-xs font-semibold ${
                activeTab === 'history'
                  ? 'bg-zred text-white border-zred'
                  : 'bg-zgray text-ztext hover:bg-zborder border-zborder'
              }`}
            >
              <History size={14} />
              <span>History</span>
            </button>

            {/* + Customer Info Button */}
            <button
              onClick={() => setShowCustomerModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zred/10 text-zred hover:bg-zred/20 border border-zred/20 transition-colors text-xs font-semibold"
            >
              <UserPlus size={14} />
              <span>
                {customerName || customerPhone
                  ? `Customer: ${customerName || customerPhone}`
                  : '+ Customer Info'}
              </span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={() => {
                if (activeTab === 'pos') fetchCatalog();
                else fetchHistory(historyPage);
              }}
              disabled={loadingCatalog || loadingHistory}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zgray text-ztext-light hover:text-ztext hover:bg-zborder transition-colors text-xs font-medium"
            >
              <RefreshCw size={14} className={loadingCatalog || loadingHistory ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-zred flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs text-ztext-lighter hover:text-zred font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: COUNTER POS INTERFACE */}
      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Product Selection Catalog */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-zcard p-3 sm:p-4 rounded-xl border border-zborder shadow-z flex flex-col md:flex-row md:items-center gap-3">
              {/* Product search box with optimized width */}
              <div className="relative w-full md:w-64 lg:w-72 shrink-0">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="input-z pl-9 text-xs h-9 w-full"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ztext-lighter hover:text-ztext px-1.5 py-0.5 rounded bg-zgray"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Horizontal Category Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none flex-1 min-w-0">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                    selectedCategory === 'all'
                      ? 'bg-zred text-white shadow-z'
                      : 'bg-zgray text-ztext-light hover:text-ztext hover:bg-zborder'
                  }`}
                >
                  All Items ({products.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                      selectedCategory === cat.id
                        ? 'bg-zred text-white shadow-z'
                        : 'bg-zgray text-ztext-light hover:text-ztext hover:bg-zborder'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Cards Grid */}
            {loadingCatalog ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-zcard p-4 rounded-xl border border-zborder animate-pulse h-40 flex flex-col justify-between">
                    <div className="h-4 bg-zsurface rounded w-3/4" />
                    <div className="h-3 bg-zsurface rounded w-1/2" />
                    <div className="h-8 bg-zsurface rounded w-full mt-4" />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-zcard p-8 rounded-xl border border-zborder text-center">
                <ShoppingBag size={32} className="mx-auto text-ztext-lighter mb-2" />
                <p className="font-semibold text-ztext text-sm">No products found</p>
                <p className="text-xs text-ztext-light mt-1">Try searching with a different term or select another category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredProducts.map((prod, idx) => {
                  const inCart = cart.find((i) => i.id === prod.id);
                  const isOutOfStock = prod.track_inventory && prod.stock_quantity <= 0;
                  const isAvailable = prod.is_available && prod.is_active && !isOutOfStock;

                  return (
                    <div
                      key={prod.id}
                      className={`bg-zcard rounded-xl border border-zborder p-3.5 flex flex-col justify-between transition-all hover:border-ztext-light ${
                        inCart ? 'ring-1 ring-zred bg-red-500/5' : ''
                      } ${!isAvailable ? 'opacity-50' : ''}`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1.5 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                prod.is_vegetarian ? 'bg-green-500' : 'bg-red-500'
                              }`}
                              title={prod.is_vegetarian ? 'Vegetarian' : 'Non-Vegetarian'}
                            />
                            <h3 className="font-semibold text-ztext text-xs line-clamp-1">{prod.name}</h3>
                          </div>
                        </div>

                        {prod.image && (
                          <div className="relative w-full h-20 rounded-lg overflow-hidden mb-2 bg-zgray">
                            <Image
                              src={prod.image}
                              alt={prod.name}
                              fill
                              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                              className="object-cover"
                              priority={idx < 6}
                            />
                          </div>
                        )}

                        <p className="font-bold text-ztext text-sm">₹{prod.price}</p>
                        {((Number(prod.packaging_big_qty) || 0) > 0 || (Number(prod.packaging_small_qty) || 0) > 0) && (
                          <div className="text-[10px] text-amber-400/90 font-medium flex items-center gap-1 mt-0.5">
                            <span>📦</span>
                            <span>
                              {[
                                (Number(prod.packaging_big_qty) || 0) > 0 ? `${prod.packaging_big_qty} Big` : '',
                                (Number(prod.packaging_small_qty) || 0) > 0 ? `${prod.packaging_small_qty} Small` : '',
                              ]
                                .filter(Boolean)
                                .join(' + ')}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3">
                        {!isAvailable ? (
                          <span className="block w-full py-1.5 text-center text-[10px] font-bold text-red-400 bg-red-500/10 rounded-lg">
                            Out of stock
                          </span>
                        ) : inCart ? (
                          <div className="flex items-center justify-between bg-zred text-white rounded-lg px-2 py-1">
                            <button
                              onClick={() => updateQuantity(prod.id, -1)}
                              className="p-1 hover:bg-black/20 rounded transition-colors"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="text-xs font-bold px-1">{inCart.quantity}</span>
                            <button
                              onClick={() => updateQuantity(prod.id, 1)}
                              className="p-1 hover:bg-black/20 rounded transition-colors"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(prod)}
                            className="w-full py-1.5 rounded-lg bg-zgray hover:bg-zred hover:text-white text-ztext text-xs font-bold transition-all flex items-center justify-center gap-1 border border-zborder hover:border-zred"
                          >
                            <Plus size={14} /> Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Counter Bill Section */}
          <div className="lg:col-span-5 space-y-4">

            {/* Cart & Billing Summary */}
            <div className="bg-zcard p-4 rounded-xl border border-zborder shadow-z space-y-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-zborder gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-ztext-light flex items-center gap-1.5 min-w-0 truncate">
                  <ShoppingBag size={14} className="text-zred shrink-0" />
                  <span className="truncate">Counter Bill ({cart.length})</span>
                </h2>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Take Away Toggle Button */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isTakeaway}
                    onClick={() => setIsTakeaway((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border ${
                      isTakeaway
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-sm'
                        : 'bg-zgray border-zborder text-ztext-light hover:text-ztext'
                    }`}
                    title={isTakeaway ? 'Take Away mode enabled (packet charges applied)' : 'Click to enable Take Away (adds packet charges)'}
                  >
                    <span className="text-xs">{isTakeaway ? '🥡' : '🏪'}</span>
                    <span>{isTakeaway ? 'Take Away (Parcel)' : 'Dine-in'}</span>
                    <span
                      className={`w-2 h-2 rounded-full transition-colors ${
                        isTakeaway ? 'bg-amber-400' : 'bg-zborder'
                      }`}
                    />
                  </button>

                  {/* Clear Bag Button */}
                  {cart.length > 0 && (
                    <button
                      onClick={clearCart}
                      className="text-[11px] font-medium text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 shrink-0 py-1"
                    >
                      <Trash2 size={12} /> Clear Bag
                    </button>
                  )}
                </div>
              </div>

              {/* Line Items */}
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {cart.length === 0 ? (
                  <div className="py-6 text-center text-ztext-lighter text-xs">
                    No items added yet. Click products on the left to add them to the bill.
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-zgray p-2.5 rounded-lg text-xs">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-semibold text-ztext truncate">{item.name}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[11px] text-ztext-light">₹{item.price} × {item.quantity}</p>
                          {((item.packagingBigQty ?? 0) > 0 || (item.packagingSmallQty ?? 0) > 0) && (
                            <span
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                                isTakeaway
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : 'bg-zcard text-ztext-lighter'
                              }`}
                              title={isTakeaway ? 'Takeaway packaging packets required' : 'Packet requirement if takeaway enabled'}
                            >
                              📦 {[
                                (item.packagingBigQty ?? 0) > 0 ? `${(item.packagingBigQty ?? 0) * item.quantity} Big` : '',
                                (item.packagingSmallQty ?? 0) > 0 ? `${(item.packagingSmallQty ?? 0) * item.quantity} Small` : '',
                              ].filter(Boolean).join(' + ')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 bg-zcard border border-zborder rounded-md px-1.5 py-0.5">
                          <button onClick={() => updateQuantity(item.id, -1)} className="text-ztext-light hover:text-zred">
                            <Minus size={12} />
                          </button>
                          <span className="font-bold text-ztext text-xs min-w-[1rem] text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1)} className="text-ztext-light hover:text-zred">
                            <Plus size={12} />
                          </button>
                        </div>

                        <span className="font-bold text-ztext min-w-[3rem] text-right">₹{item.price * item.quantity}</span>

                        <button onClick={() => removeFromCart(item.id)} className="text-ztext-lighter hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bill Summary Calculations */}
              <div className="border-t border-zborder pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-ztext-light">
                  <span>Subtotal</span>
                  <span className="font-medium text-ztext">₹{subtotal}</span>
                </div>
                {maintenanceFee > 0 && (
                  <div className="flex justify-between text-ztext-light">
                    <span>Maintenance Fee</span>
                    <span className="font-medium text-ztext">₹{maintenanceFee}</span>
                  </div>
                )}
                {packagingCharge > 0 && (
                  <div className="flex justify-between text-ztext-light">
                    <div>
                      <span>Packaging Charge</span>
                      {(totalBigPackets > 0 || totalSmallPackets > 0) && (
                        <span className="text-[10px] text-amber-400 block sm:inline sm:ml-1 font-medium">
                          ({totalBigPackets > 0 ? `${totalBigPackets} Big @ ₹${bigPacketPrice}` : ''}
                          {totalBigPackets > 0 && totalSmallPackets > 0 ? ' + ' : ''}
                          {totalSmallPackets > 0 ? `${totalSmallPackets} Small @ ₹${smallPacketPrice}` : ''})
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-ztext">₹{packagingCharge}</span>
                  </div>
                )}
                <div className="border-t border-zborder pt-2 flex justify-between font-bold text-ztext text-sm">
                  <span>Total Payable</span>
                  <span className="text-zred">₹{total}</span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="pt-1">
                <label className="text-[10px] font-semibold text-ztext-light uppercase tracking-wide mb-1 block">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-1.5 px-1.5 sm:px-2 rounded-lg border text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-all text-center ${
                      paymentMethod === 'cash'
                        ? 'border-zred bg-red-500/10 text-zred shadow-sm'
                        : 'border-zborder bg-zgray text-ztext-light hover:text-ztext'
                    }`}
                  >
                    <Banknote size={13} className="shrink-0" />
                    <span className="truncate">Cash<span className="hidden sm:inline"> Payment</span></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('razorpay')}
                    className={`py-1.5 px-1.5 sm:px-2 rounded-lg border text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-all text-center ${
                      paymentMethod === 'razorpay'
                        ? 'border-zred bg-red-500/10 text-zred shadow-sm'
                        : 'border-zborder bg-zgray text-ztext-light hover:text-ztext'
                    }`}
                  >
                    <CreditCard size={13} className="shrink-0" />
                    <span className="truncate">Online<span className="hidden sm:inline"> / Razorpay</span></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi')}
                    className={`py-1.5 px-1.5 sm:px-2 rounded-lg border text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-all text-center ${
                      paymentMethod === 'upi'
                        ? 'border-zred bg-red-500/10 text-zred shadow-sm'
                        : 'border-zborder bg-zgray text-ztext-light hover:text-ztext'
                    }`}
                  >
                    <QrCode size={13} className="shrink-0" />
                    <span>UPI</span>
                  </button>
                </div>
              </div>

              {/* Cash change calculator helper */}
              {paymentMethod === 'cash' && cart.length > 0 && (
                <div className="p-3 bg-zgray rounded-xl border border-zborder space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-ztext flex items-center gap-1">
                      <DollarSign size={13} className="text-emerald-400" /> Cash Tendered by Customer:
                    </label>
                    <input
                      type="number"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder={`e.g. ${total}`}
                      className="input-z text-xs w-24 h-7 text-right"
                    />
                  </div>
                  {tenderedAmount > 0 && (
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-zborder">
                      <span className="text-ztext-light font-medium">Return Change:</span>
                      <span className={`font-bold ${changeDue >= 0 ? 'text-emerald-400' : 'text-zred'}`}>
                        ₹{changeDue}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Notes Field */}
              <div>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Counter order notes (e.g. less spicy, extra tissue)..."
                  className="input-z text-xs h-8 w-full"
                />
              </div>

              {/* Complete Order Action Button */}
              <button
                onClick={handleCheckout}
                disabled={placing || cart.length === 0}
                className="button-z button-z-primary w-full h-11 text-xs font-bold shadow-z transition-all disabled:opacity-50"
              >
                {placing ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing {isTakeaway ? 'Take Away' : 'In-Store'} Order...
                  </span>
                ) : (
                  `Confirm & Checkout ${isTakeaway ? '(Take Away)' : ''} • ₹${total}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: IN-STORE ORDERS & REVENUE HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Stat Cards Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zcard p-4 rounded-xl border border-zborder shadow-z">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ztext-light font-medium">Total In-Store Orders</span>
                <ShoppingBag size={18} className="text-zred" />
              </div>
              <p className="text-2xl font-bold text-ztext">{historyStats.totalOrders}</p>
              <p className="text-[11px] text-ztext-lighter mt-0.5">Counter orders recorded</p>
            </div>

            <div className="bg-zcard p-4 rounded-xl border border-zborder shadow-z">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ztext-light font-medium">Today&apos;s Revenue</span>
                <TrendingUp size={18} className="text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-ztext">{fmt(historyStats.todayRevenue)}</p>
              <p className="text-[11px] text-ztext-lighter mt-0.5">In-store sales today</p>
            </div>

            <div className="bg-zcard p-4 rounded-xl border border-zborder shadow-z">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ztext-light font-medium">Total Revenue</span>
                <Calendar size={18} className="text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-ztext">{fmt(historyStats.totalRevenue)}</p>
              <p className="text-[11px] text-ztext-lighter mt-0.5">Filtered counter sales</p>
            </div>

            <div className="bg-zcard p-4 rounded-xl border border-zborder shadow-z">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ztext-light font-medium">Cash vs Online</span>
                <Banknote size={18} className="text-blue-400" />
              </div>
              <p className="text-lg font-bold text-ztext">{fmt(historyStats.cashRevenue)}</p>
              <p className="text-[11px] text-ztext-light mt-0.5">
                Cash: {fmt(historyStats.cashRevenue)} • Online: {fmt(historyStats.onlineRevenue)}
              </p>
            </div>
          </div>

          {/* Filters & Orders List */}
          <div className="bg-zcard rounded-xl border border-zborder shadow-z">
            <div className="p-4 border-b border-zborder space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative flex-1 w-full">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search in-store orders by tracking code, customer name or phone..."
                    className="input-z pl-9 text-xs h-9 w-full"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zborder bg-zgray text-xs">
                    <Filter size={14} className="text-ztext-muted" />
                    <select
                      value={historyPaymentFilter}
                      onChange={(e) => setHistoryPaymentFilter(e.target.value)}
                      className="bg-transparent text-ztext font-medium outline-none cursor-pointer"
                    >
                      <option value="all">All Payment Methods</option>
                      <option value="cash">Cash Only</option>
                      <option value="razorpay">Razorpay / Online Only</option>
                      <option value="upi">UPI Only</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zborder bg-zgray text-xs">
                    <Store size={14} className="text-ztext-muted" />
                    <select
                      value={historyOrderTypeFilter}
                      onChange={(e) => setHistoryOrderTypeFilter(e.target.value)}
                      className="bg-transparent text-ztext font-medium outline-none cursor-pointer"
                    >
                      <option value="all">All Order Types</option>
                      <option value="in_store">In-Store Only</option>
                      <option value="takeaway">Take Away Only</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Date & Time Quick Filters Bar */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zborder/60">
                <span className="text-[11px] font-semibold text-ztext-light flex items-center gap-1 mr-1">
                  <Calendar size={13} className="text-zred" /> Date Filter:
                </span>

                <button
                  onClick={() => setDateQuickFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    dateQuickFilter === 'all'
                      ? 'bg-zred text-white shadow-z'
                      : 'bg-zgray text-ztext-light hover:text-ztext hover:bg-zborder'
                  }`}
                >
                  All Time
                </button>
                <button
                  onClick={() => setDateQuickFilter('today')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    dateQuickFilter === 'today'
                      ? 'bg-zred text-white shadow-z'
                      : 'bg-zgray text-ztext-light hover:text-ztext hover:bg-zborder'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setDateQuickFilter('yesterday')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    dateQuickFilter === 'yesterday'
                      ? 'bg-zred text-white shadow-z'
                      : 'bg-zgray text-ztext-light hover:text-ztext hover:bg-zborder'
                  }`}
                >
                  Yesterday
                </button>
                <button
                  onClick={() => setDateQuickFilter('custom')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    dateQuickFilter === 'custom'
                      ? 'bg-zred text-white shadow-z'
                      : 'bg-zgray text-ztext-light hover:text-ztext hover:bg-zborder'
                  }`}
                >
                  Custom
                </button>

                {dateQuickFilter !== 'all' && (
                  <button
                    onClick={() => setDateQuickFilter('all')}
                    className="px-2 py-1 text-[11px] font-medium text-red-400 hover:underline ml-auto sm:ml-2"
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              {/* Custom Date & Time Controls */}
              {dateQuickFilter === 'custom' && (
                <div className="p-3 bg-zgray rounded-xl border border-zborder flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <label className="font-semibold text-ztext-light">Date:</label>
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="input-z text-xs h-8 px-2"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="font-semibold text-ztext-light flex items-center gap-1">
                      <Clock size={12} className="text-ztext-muted" /> From:
                    </label>
                    <input
                      type="time"
                      value={customFromTime}
                      onChange={(e) => setCustomFromTime(e.target.value)}
                      className="input-z text-xs h-8 px-2"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="font-semibold text-ztext-light flex items-center gap-1">
                      <Clock size={12} className="text-ztext-muted" /> To:
                    </label>
                    <input
                      type="time"
                      value={customToTime}
                      onChange={(e) => setCustomToTime(e.target.value)}
                      className="input-z text-xs h-8 px-2"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* History Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zborder text-ztext-lighter text-left font-semibold bg-zgray/50">
                    <th className="px-4 py-3">Tracking</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Date & Time</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zborder">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-ztext-lighter">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                        Loading in-store order history...
                      </td>
                    </tr>
                  ) : historyOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-ztext-lighter">
                        No in-store orders found matching your search and date filters.
                      </td>
                    </tr>
                  ) : (
                    historyOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-zgray/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-ztext">
                          {order.tracking_code}
                        </td>
                        <td className="px-4 py-3">
                          {order.order_type === 'takeaway' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              🥡 Take Away
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              🏪 In-Store
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ztext">{order.customer_name ?? 'Walk-in Customer'}</p>
                          <p className="text-[11px] text-ztext-light">{order.customer_phone ?? 'N/A'}</p>
                        </td>
                        <td className="px-4 py-3 text-ztext-light">
                          {order.order_items?.length ?? 0} item{(order.order_items?.length ?? 0) !== 1 ? 's' : ''}
                        </td>
                        <td className="px-4 py-3 font-bold text-ztext">
                          {fmt(order.total)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              order.payment_method === 'cash'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : order.payment_method === 'upi'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}
                          >
                            {order.payment_method ?? 'CASH'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ztext-lighter">
                          {new Date(order.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openReceiptFromHistory(order)}
                              className="px-2 py-1 rounded bg-zgray hover:bg-zborder text-ztext text-[11px] font-semibold flex items-center gap-1 transition-colors"
                              title="Print Receipt"
                            >
                              <Printer size={13} /> Print
                            </button>
                            <button
                              onClick={() => setSelectedHistoryOrder(order)}
                              className="p-1 rounded hover:bg-zgray text-ztext-light hover:text-ztext transition-colors"
                              title="View Details"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {historyTotalPages > 1 && (
              <div className="p-3 border-t border-zborder flex items-center justify-between text-xs text-ztext-light">
                <span>Page {historyPage} of {historyTotalPages}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchHistory(historyPage - 1)}
                    disabled={historyPage <= 1}
                    className="px-3 py-1 bg-zgray rounded-lg disabled:opacity-40 font-medium"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => fetchHistory(historyPage + 1)}
                    disabled={historyPage >= historyTotalPages}
                    className="px-3 py-1 bg-zgray rounded-lg disabled:opacity-40 font-medium"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OPTIONAL CUSTOMER DETAILS MODAL */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-zborder pb-3">
              <h3 className="text-sm font-bold text-ztext flex items-center gap-2">
                <UserPlus size={16} className="text-zred" /> Customer Details (Optional)
              </h3>
              <button onClick={() => setShowCustomerModal(false)} className="p-1 text-ztext-lighter hover:text-ztext">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-ztext uppercase tracking-wide mb-1 block">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="Enter phone number (e.g. 9876543210)"
                    className="input-z pl-9 text-xs h-9 w-full"
                  />
                  {searchingCustomer && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-zred" />
                  )}
                </div>
                {isExistingCustomer && (
                  <p className="text-[10px] text-emerald-400 mt-1 font-medium flex items-center gap-1">
                    <Check size={11} /> Found matching customer profile!
                  </p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-semibold text-ztext uppercase tracking-wide mb-1 block">
                  Customer Name
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer Name"
                    className="input-z pl-9 text-xs h-9 w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-ztext uppercase tracking-wide mb-1 block">
                  Email Address (Optional)
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="Optional customer email"
                    className="input-z pl-9 text-xs h-9 w-full"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zborder gap-2">
              <button
                type="button"
                onClick={() => {
                  setCustomerPhone('');
                  setCustomerName('');
                  setCustomerEmail('');
                  setIsExistingCustomer(false);
                  setShowCustomerModal(false);
                }}
                className="px-3 py-2 text-xs font-semibold text-red-400 hover:underline"
              >
                Clear Details
              </button>

              <button
                type="button"
                onClick={() => setShowCustomerModal(false)}
                className="button-z button-z-primary px-4 py-2 text-xs font-bold shadow-z"
              >
                Save Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL AFTER CHECKOUT */}
      {successData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-lg font-bold text-ztext">Order Successfully Created!</h2>
              <p className="text-xs text-ztext-light">
                {successData.orderType === 'takeaway'
                  ? 'In-store take away parcel order has been confirmed'
                  : 'In-store counter bill has been confirmed'}
              </p>
            </div>

            <div className="bg-zgray p-4 rounded-xl border border-zborder space-y-2.5 text-xs">
              <div className="flex justify-between border-b border-zborder pb-2">
                <span className="text-ztext-light font-medium">Tracking Code:</span>
                <span className="font-mono font-bold text-ztext text-sm">{successData.trackingCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ztext-light">Order Type:</span>
                <span className="font-semibold text-ztext flex items-center gap-1">
                  {successData.orderType === 'takeaway' ? (
                    <span className="text-amber-400 font-bold">🥡 Take Away (Parcel)</span>
                  ) : (
                    <span className="text-purple-400 font-bold">🏪 In-Store (Dine-in)</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ztext-light">Customer:</span>
                <span className="font-semibold text-ztext">{successData.customerName} ({successData.customerPhone})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ztext-light">Payment Method:</span>
                <span className="font-semibold text-emerald-400">{successData.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ztext-light">Items ({successData.items.length}):</span>
                <span className="font-medium text-ztext truncate max-w-[180px]">
                  {successData.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-zborder font-bold text-sm text-ztext">
                <span>Total Amount Paid:</span>
                <span className="text-zred">₹{successData.total}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPrintReceiptData(successData)}
                className="py-2.5 bg-zgray border border-zborder text-ztext rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-zborder transition-colors"
              >
                <Printer size={15} /> Print Receipt
              </button>

              <button
                onClick={handleStartNewOrder}
                className="button-z button-z-primary py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-z"
              >
                <Sparkles size={15} /> New Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE RECEIPT MODAL */}
      {printReceiptData && (
        <PrintableReceipt
          order={printReceiptData}
          onClose={() => setPrintReceiptData(null)}
        />
      )}

      {/* ORDER DETAILS MODAL (FROM HISTORY) */}
      {selectedHistoryOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zcard border border-zborder rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zborder pb-3">
              <h3 className="text-sm font-bold text-ztext flex items-center gap-2">
                <FileText size={16} className="text-zred" /> In-Store Order Details
              </h3>
              <button onClick={() => setSelectedHistoryOrder(null)} className="p-1 text-ztext-lighter hover:text-ztext">
                &times;
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-ztext-light">Tracking Code:</span><span className="font-mono font-bold text-ztext">{selectedHistoryOrder.tracking_code}</span></div>
              <div className="flex justify-between">
                <span className="text-ztext-light">Order Type:</span>
                <span className="font-bold text-ztext">
                  {selectedHistoryOrder.order_type === 'takeaway' ? '🥡 Take Away (Parcel)' : '🏪 In-Store (Dine-in)'}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-ztext-light">Customer Name:</span><span className="font-semibold text-ztext">{selectedHistoryOrder.customer_name ?? 'Walk-in Customer'}</span></div>
              <div className="flex justify-between"><span className="text-ztext-light">Phone Number:</span><span className="text-ztext">{selectedHistoryOrder.customer_phone ?? 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-ztext-light">Payment Method:</span><span className="font-bold text-emerald-400 capitalize">{selectedHistoryOrder.payment_method ?? 'cash'}</span></div>
              <div className="flex justify-between"><span className="text-ztext-light">Date Created:</span><span className="text-ztext">{new Date(selectedHistoryOrder.created_at).toLocaleString()}</span></div>

              {selectedHistoryOrder.order_items && selectedHistoryOrder.order_items.length > 0 && (
                <div className="pt-2 border-t border-zborder">
                  <span className="font-semibold text-ztext mb-1 block">Line Items:</span>
                  <div className="space-y-1 bg-zgray p-2.5 rounded-lg max-h-36 overflow-y-auto">
                    {selectedHistoryOrder.order_items.map((i) => (
                      <div key={i.id} className="flex justify-between">
                        <span>{i.quantity}x {i.product_name}</span>
                        <span className="font-semibold">₹{i.subtotal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2 border-t border-zborder font-bold text-sm text-ztext">
                <span>Total Amount:</span>
                <span className="text-zred">₹{selectedHistoryOrder.total}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  openReceiptFromHistory(selectedHistoryOrder);
                  setSelectedHistoryOrder(null);
                }}
                className="w-full py-2.5 bg-zred text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-red-600 transition-colors shadow-z"
              >
                <Printer size={15} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
