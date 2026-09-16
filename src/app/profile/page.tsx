'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, MapPin, Phone, Mail, LogOut, ClipboardList, ChevronRight, Store, Heart, Pencil, X, Check, Loader2, Clock, BadgeCheck, HelpCircle, Instagram, Facebook, Globe, MessageSquare, ShieldCheck, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuthStore } from '@/features/auth/store';
import { showToast } from '@/components/shared/Toast';
import { updateServerProfile, getServerAddress, updateServerAddress } from '@/features/auth/actions';
import { getUserOrders } from '@/features/orders/actions/customer';
import type { Order } from '@/features/orders/types';
import { getCreditAccount } from '@/features/bnpl/actions';
import { getWalletDetails } from '@/features/wallet/actions';
import WalletKycModal from '@/features/wallet/components/WalletKycModal';
import type { Wallet } from '@/features/wallet/types';
import { menuSections } from '@/features/menu/data';
import { useFavoritesStore } from '@/features/favorites/store';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import { isStoreOpen, nextOrderByCutoff, formatClock, isTemporarilyClosed, temporaryCloseLabel } from '@/features/menu/lib/store-hours';
import HamsterLoader from '@/components/ui/HamsterLoader';

const allMenuItems = menuSections.flatMap((s) => s.items);

function foodImageFor(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const q = name.toLowerCase();
  return allMenuItems.find((i) => q.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(q))?.img;
}

function StoreStatusPill() {
  const [now, setNow] = useState(() => new Date());
  const settings = usePublicSettings();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const hours = { open: settings.hours.open, close: settings.hours.close };
  const tempClosed = isTemporarilyClosed(settings.tempReopensAt, now);
  const open = !tempClosed && isStoreOpen(hours, now);
  const cutoff = open ? nextOrderByCutoff(settings.orderByCutoffs, now) : null;

  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-zborder bg-zcard px-4 py-3">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${open ? 'bg-zgreen' : 'bg-amber-500'}`} />
      <p className="text-xs font-semibold text-ztext truncate">
        {tempClosed ? temporaryCloseLabel(settings.tempReopensAt) : open ? `Open now · Kitchen closes ${formatClock(hours.close)}` : `Closed now · Opens tomorrow ${formatClock(hours.open)}`}
      </p>
      {cutoff && (
        <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/25 rounded-full px-2.5 py-1">
          <Clock size={10} />
          {cutoff.minutesLeft <= 15
            ? `${cutoff.label} orders close in ${cutoff.minutesLeft}m`
            : `Order by ${formatClock(cutoff.time)} for ${cutoff.label}`}
        </span>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, signOut, refresh } = useAuthStore();
  const settings = usePublicSettings();

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState('');
  const [addressLoading, setAddressLoading] = useState(true);

  const [myRecentOrders, setMyRecentOrders] = useState<Order[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(true);
  
  const [walletCash, setWalletCash] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletStatus, setWalletStatus] = useState<string>('unverified');
  const [fullWalletData, setFullWalletData] = useState<Wallet | null>(null);
  const [showKycModal, setShowKycModal] = useState(false);

  const favoritesCount = useFavoritesStore((s) => s.items.length);

  async function loadWallet() {
    const res = await getWalletDetails();
    if (res.success && res.data) {
      setWalletCash(res.data.balance);
      const status = res.data.wallet?.status;
      if (status === 'pending' || (res.data.wallet?.kyc_submitted_at && status !== 'active' && status !== 'rejected')) {
        setWalletStatus('pending');
      } else if (status === 'active') {
        setWalletStatus('active');
      } else if (status === 'rejected') {
        setWalletStatus('rejected');
      } else {
        setWalletStatus('unverified');
      }
      setFullWalletData(res.data.wallet);
    } else {
      const creditRes = await getCreditAccount();
      if (creditRes.success && creditRes.data) setWalletCash(creditRes.data.available_credit);
    }
    setWalletLoading(false);
  }

  async function loadAddress() {
    const result = await getServerAddress();
    if (result.address) {
      setAddress(result.address.full_address || '');
    }
    setAddressLoading(false);
  }

  async function loadRecentOrders() {
    const res = await getUserOrders(1, 2);
    if (res.success && res.data) {
      setMyRecentOrders(res.data.orders);
      setOrderCount(res.data.total);
    }
    setOrdersLoading(false);
  }

  useEffect(() => {
    if (isAuthenticated) {
       
      loadAddress();
      loadRecentOrders();
      loadWallet();
    }
  }, [isAuthenticated]);

  function startEdit(field: string, currentValue: string) {
    setEditingField(field);
    setEditValue(currentValue);
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValue('');
  }

  async function handleSave() {
    if (!editingField || !editValue.trim()) return;
    setSaving(true);

    if (editingField === 'name') {
      const result = await updateServerProfile({ full_name: editValue });
      if (result.error) {
        showToast(result.error);
      } else {
        await refresh();
        showToast('Name updated');
      }
    } else if (editingField === 'phone') {
      const cleanPhone = editValue.trim();
      if (!/^[0-9]{10}$/.test(cleanPhone)) {
        showToast('Phone number must be exactly 10 digits (0-9)');
        setSaving(false);
        return;
      }
      const result = await updateServerProfile({ phone: cleanPhone });
      if (result.error) {
        showToast(result.error);
      } else {
        await refresh();
        showToast('Phone updated');
      }
    } else if (editingField === 'address') {
      const formData = new FormData();
      formData.set('fullAddress', editValue);
      const result = await updateServerAddress(formData);
      if (result.error) {
        showToast(result.error);
      } else {
        setAddress(editValue);
        showToast('Address updated');
      }
    }

    setSaving(false);
    setEditingField(null);
    setEditValue('');
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center page-pad">
        <HamsterLoader size="md" text="Loading profile..." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="page-pad">
        <div className="container-z mx-auto max-w-lg text-center py-16">
          <div className="w-20 h-20 rounded-full bg-zgray flex items-center justify-center mx-auto">
            <User size={36} className="text-ztext-muted" />
          </div>
          <h1 className="text-xl font-bold text-ztext mt-5">Welcome to Dilip Da</h1>
          <p className="text-sm text-ztext-light mt-2">
            Sign in to manage your profile, view orders, and save your delivery address.
          </p>
          <Link href="/auth/login" className="button-z button-z-primary mt-6">
            Sign in
          </Link>
          <Link href="/auth/signup" className="button-z button-z-outline mt-3">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  const initials = (user.fullName || user.email || 'U')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  function renderEditActions() {
    if (saving) {
      return <Loader2 size={16} className="animate-spin text-ztext-muted shrink-0" />;
    }
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={handleSave} className="size-7 grid place-items-center rounded-md hover:bg-zgreen/10 text-zgreen transition-colors">
          <Check size={15} />
        </button>
        <button onClick={cancelEdit} className="size-7 grid place-items-center rounded-md hover:bg-zred/10 text-zred transition-colors">
          <X size={15} />
        </button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400', accepted: 'bg-blue-500/10 text-blue-400',
    preparing: 'bg-indigo-500/10 text-indigo-400', ready: 'bg-green-500/10 text-green-400',
    assigned: 'bg-purple-500/10 text-purple-400', out_for_delivery: 'bg-orange-500/10 text-orange-400',
    delivered: 'bg-emerald-500/10 text-emerald-400', completed: 'bg-emerald-500/10 text-emerald-400',
    cancelled: 'bg-red-500/10 text-red-400',
  };

  return (
    <div className="page-pad">
      <div className="container-z mx-auto max-w-lg">
        {/* User card */}
        <div className="bg-zcard rounded-2xl border border-zborder p-5 flex items-center gap-3.5 shadow-sm">
          <div className="w-[52px] h-[52px] rounded-full bg-zred/15 flex items-center justify-center text-zred font-extrabold text-lg shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ztext text-[15px] truncate">
              {user.fullName || 'Dilip Da Customer'}
            </p>
            <p className="text-xs text-ztext-light truncate">{user.email}</p>
          </div>
        </div>

            {/* Store status */}
            <StoreStatusPill />

            {/* Stats row */}
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <div className="bg-zcard rounded-xl border border-zborder p-3 text-center">
                <div className="h-7 flex items-center justify-center">
                  {ordersLoading ? <Loader2 size={18} className="animate-spin text-ztext-muted" /> : <p className="text-lg font-extrabold text-ztext">{orderCount}</p>}
                </div>
                <p className="text-[10px] text-ztext-light mt-0.5">Total Orders</p>
              </div>
              {settings.walletEnabled ? (
                <button onClick={() => {
                  if (walletStatus === 'active') {
                    router.push('/dashboard/student/wallet');
                  } else {
                    setShowKycModal(true);
                  }
                }} className="bg-zcard rounded-xl border border-zborder p-3 flex flex-col items-center justify-center hover:border-zred/40 transition-colors w-full h-full">
                  {walletLoading ? (
                    <>
                      <div className="h-7 flex items-center justify-center">
                        <Loader2 size={18} className="animate-spin text-ztext-muted" />
                      </div>
                      <p className="text-[10px] text-ztext-light mt-0.5">Wallet Cash</p>
                    </>
                  ) : walletStatus === 'active' ? (
                    <>
                      <div className="h-7 flex items-center justify-center">
                        <p className="text-lg font-extrabold text-ztext">
                          {walletCash !== null ? `₹${walletCash.toLocaleString('en-IN')}` : '—'}
                        </p>
                      </div>
                      <p className="text-[10px] text-ztext-light mt-0.5">Wallet Cash</p>
                    </>
                  ) : walletStatus === 'pending' ? (
                    <>
                      <div className="flex items-center justify-center gap-1.5 text-amber-500">
                        <Clock size={16} />
                        <span className="text-sm font-extrabold">Reviewing</span>
                      </div>
                      <p className="text-[10px] text-ztext-light mt-0.5">Wallet KYC</p>
                    </>
                  ) : walletStatus === 'rejected' ? (
                    <>
                      <div className="flex items-center justify-center gap-1.5 text-red-500">
                        <AlertCircle size={16} />
                        <span className="text-sm font-extrabold">Rejected</span>
                      </div>
                      <p className="text-[10px] text-ztext-light mt-0.5">Re-apply KYC</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-center gap-1.5 text-zred">
                        <ShieldCheck size={16} />
                        <span className="text-sm font-extrabold">Activate</span>
                      </div>
                      <p className="text-[10px] text-ztext-light mt-0.5">Setup Wallet</p>
                    </>
                  )}
                </button>
              ) : (
                <div className="bg-zgray/50 rounded-xl border border-zborder p-3 text-center opacity-60 cursor-not-allowed select-none">
                  <p className="text-lg font-extrabold text-ztext-lighter">—</p>
                  <p className="text-[10px] text-ztext-light mt-0.5">Wallet Disabled</p>
                </div>
              )}
              <Link href="/favorites" className="bg-zcard rounded-xl border border-zborder p-3 text-center hover:border-zred/40 transition-colors">
                <p className="text-lg font-extrabold text-ztext">{favoritesCount}</p>
                <p className="text-[10px] text-ztext-light mt-0.5">Favorites</p>
              </Link>
            </div>

            {/* Recent activity */}
            <div className="mt-4 bg-zcard rounded-xl border border-zborder overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zborder">
                <h2 className="text-sm font-bold text-ztext">Recent orders</h2>
                <Link href="/orders" className="text-[10px] font-medium text-zred hover:underline">View all</Link>
              </div>
              {ordersLoading ? (
                <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-ztext-lighter" /></div>
              ) : myRecentOrders.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-ztext-light">No orders yet.</p>
                  <Link href="/menu" className="inline-block mt-2 text-[11px] font-semibold text-zred hover:underline">Order your first meal</Link>
                </div>
              ) : (
                <div className="divide-y divide-zborder">
                  {myRecentOrders.map((order) => {
                    const item = order.order_items?.[0];
                    const img = foodImageFor(item?.product_name);
                    return (
                      <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center gap-3 p-3.5 hover:bg-zgray transition-colors">
                        <div className="w-11 h-11 rounded-lg overflow-hidden border border-zborder bg-zgray relative shrink-0">
                          {img ? (
                            <Image src={img} alt={item?.product_name ?? 'Food'} fill sizes="44px" className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><ClipboardList size={16} className="text-zred" /></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-ztext text-xs truncate">
                            {item ? `${item.quantity} × ${item.product_name}` : order.tracking_code}
                          </p>
                          <p className="text-[10px] text-ztext-light mt-0.5">
                            {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ₹{order.total}
                          </p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full shrink-0 capitalize ${statusColors[order.status] ?? 'bg-zgray text-ztext-light'}`}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Personal Information */}
            <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-ztext-muted px-1">Personal Information</p>
            <div className="mt-2 bg-zcard rounded-2xl border border-zborder divide-y divide-zborder overflow-hidden">
              {/* Name */}
              <div className="p-4 flex items-center gap-3">
                <User size={18} className="text-zred shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ztext text-sm">Name</p>
                  {editingField === 'name' ? (
                    <input
                      className="input-z mt-1 text-sm"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') cancelEdit(); }}
                    />
                  ) : (
                    <p className="text-xs text-ztext-light mt-0.5 truncate">{user.fullName || 'Not set'}</p>
                  )}
                </div>
                {editingField === 'name' ? renderEditActions() : (
                  <button onClick={() => startEdit('name', user.fullName || '')} className="size-7 grid place-items-center rounded-md hover:bg-zgray text-ztext-muted transition-colors shrink-0">
                    <Pencil size={14} />
                  </button>
                )}
              </div>

              {/* Phone */}
              <div className="p-4 flex items-center gap-3">
                <Phone size={18} className="text-zred shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ztext text-sm">Phone</p>
                  {editingField === 'phone' ? (
                    <input
                      type="tel"
                      className="input-z mt-1 text-sm"
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      inputMode="numeric"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') cancelEdit(); }}
                    />
                  ) : (
                    <p className="text-xs text-ztext-light mt-0.5 inline-flex items-center gap-1">
                      {user.phone || 'Not set'}
                      {user.phone && <BadgeCheck size={12} className="text-green-500 shrink-0" />}
                    </p>
                  )}
                </div>
                {editingField === 'phone' ? renderEditActions() : (
                  <button onClick={() => startEdit('phone', user.phone || '')} className="size-7 grid place-items-center rounded-md hover:bg-zgray text-ztext-muted transition-colors shrink-0">
                    <Pencil size={14} />
                  </button>
                )}
              </div>

              {/* Delivery address */}
              <div className="p-4 flex items-start gap-3">
                <MapPin size={18} className="text-zred shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ztext text-sm">Delivery address</p>
                  {editingField === 'address' ? (
                    <textarea
                      className="input-z mt-1 text-sm resize-none h-20"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <p className="text-xs text-ztext-light mt-0.5">
                      {addressLoading ? (
                        <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading...</span>
                      ) : address ? (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-zred bg-zred/10 border border-zred/20 rounded-full px-1.5 py-0.5">Deliver here</span>
                          {address}
                        </span>
                      ) : 'No address saved'}
                    </p>
                  )}
                </div>
                {editingField === 'address' ? renderEditActions() : (
                  <button onClick={() => startEdit('address', address)} className="size-7 grid place-items-center rounded-md hover:bg-zgray text-ztext-muted transition-colors shrink-0 mt-0.5">
                    <Pencil size={14} />
                  </button>
                )}
              </div>

              {/* Email */}
              <div className="p-4 flex items-center gap-3">
                <Mail size={18} className="text-zred shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ztext text-sm">Email</p>
                  <p className="text-xs text-ztext-light mt-0.5 truncate">{user.email}</p>
                </div>
              </div>
            </div>

            {/* Preferences & Support */}
            <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-ztext-muted px-1">Preferences & Support</p>
            <div className="mt-2 bg-zcard rounded-2xl border border-zborder divide-y divide-zborder overflow-hidden">

              {/* Help & support */}
              <Link href={`tel:${settings.supportPhone || '6000212823'}`} className="p-4 flex items-center gap-3 hover:bg-zgray transition-colors">

                <HelpCircle size={18} className="text-zred shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-ztext text-sm">Help &amp; Customer Support</p>
                  <p className="text-xs text-ztext-light mt-0.5">Chat with Dilip Da Team</p>
                </div>
                <ChevronRight size={16} className="text-ztext-muted shrink-0" />
              </Link>

              {/* Orders link */}
              <Link href="/orders" className="p-4 flex items-center gap-3 hover:bg-zgray transition-colors">
                <ClipboardList size={18} className="text-zred shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-ztext text-sm">My Orders</p>
                  <p className="text-xs text-ztext-light mt-0.5">View order history</p>
                </div>
                <ChevronRight size={16} className="text-ztext-muted shrink-0" />
              </Link>

              {/* Favorites link (Desktop only) */}
              <Link href="/favorites" className="hidden sm:flex p-4 items-center gap-3 hover:bg-zgray transition-colors">
                <Heart size={18} className="text-zred shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-ztext text-sm">Favorites</p>
                  <p className="text-xs text-ztext-light mt-0.5">Your saved dishes</p>
                </div>
                <ChevronRight size={16} className="text-ztext-muted shrink-0" />
              </Link>
            </div>

            {/* About section */}
            <div className="mt-4 bg-zcard rounded-xl border border-zborder p-5">
              <h2 className="text-sm font-bold text-ztext mb-2 flex items-center gap-2">
                <Store size={18} className="text-zred" /> About Dilip Da
              </h2>
              <p className="text-xs text-ztext-light leading-relaxed">
                Homestyle food service near CIT Kokrajhar&apos;s 2nd gate.
                Fresh, authentic meals cooked with love — from classic fish curry to evening chai.
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-ztext-light">
                  <MapPin size={14} className="text-ztext-muted" /> {settings.address || 'Near CIT Kokrajhar, 2nd Gate'}
                </div>
                <div className="flex items-center gap-2 text-xs text-ztext-light">
                  <Phone size={14} className="text-ztext-muted" /> {settings.supportPhone || '6000212823'}
                </div>
                {settings.supportEmail && (
                  <div className="flex items-center gap-2 text-xs text-ztext-light">
                    <Mail size={14} className="text-ztext-muted" /> {settings.supportEmail}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 text-xs">
                  {settings.whatsapp && (
                    <a href={`https://wa.me/${settings.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ztext-light hover:text-zgreen transition-colors">
                      <MessageSquare size={12} /> WhatsApp
                    </a>
                  )}
                  {settings.instagram && (
                    <a href={settings.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ztext-light hover:text-pink-500 transition-colors">
                      <Instagram size={12} /> Instagram
                    </a>
                  )}
                  {settings.facebook && (
                    <a href={settings.facebook} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ztext-light hover:text-blue-500 transition-colors">
                      <Facebook size={12} /> Facebook
                    </a>
                  )}
                  {settings.website && (
                    <a href={settings.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ztext-light hover:text-ztext transition-colors">
                      <Globe size={12} /> Website
                    </a>
                  )}
                </div>
                {(settings.storeUpiId || settings.storeUpiName) && (
                  <div className="flex items-center gap-2 text-xs text-ztext-light pt-2 border-t border-zborder">
                    <span className="text-ztext-muted">UPI:</span>
                    <span>{settings.storeUpiName || ''} {settings.storeUpiId ? `@${settings.storeUpiId}` : ''}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sign out */}
            <button
              onClick={signOut}
              className="mt-4 w-full bg-zcard rounded-xl border border-zborder p-4 flex items-center gap-3 hover:bg-red-500/5 transition-colors"
            >
              <LogOut size={18} className="text-zred shrink-0" />
              <span className="font-semibold text-zred text-sm">Sign out</span>
            </button>
      </div>

      <WalletKycModal
        isOpen={showKycModal}
        onClose={() => setShowKycModal(false)}
        walletStatus={walletStatus}
        wallet={fullWalletData}
        defaultName={user?.fullName || ''}
        defaultEmail={user?.email || ''}
        onSuccess={() => {
          setWalletStatus('pending');
          setShowKycModal(false);
          loadWallet();
        }}
      />
    </div>
  );
}

