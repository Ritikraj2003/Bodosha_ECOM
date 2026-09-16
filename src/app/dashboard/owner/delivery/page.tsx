'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/data-table';
import DateFilter, { type DateFilterValue } from '@/components/ui/date-filter';
import { getOwnerDeliveryPartners } from '@/features/owner/actions';
import type { DeliveryPartnerAdmin } from '@/features/admin/types';

export default function OwnerDeliveryPage() {
  const [partners, setPartners] = useState<DeliveryPartnerAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateFilterValue>({});

  const fetchPartners = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await getOwnerDeliveryPartners({ ...dateRange });
    if (res.success && res.data) setPartners(res.data as DeliveryPartnerAdmin[]);
    if (!silent) setLoading(false);
  }, [dateRange]);

  useEffect(() => {
    fetchPartners();  
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filterKey = useMemo(() => JSON.stringify(dateRange), [dateRange]);
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (filterKey === lastFilterKey.current) return;
    lastFilterKey.current = filterKey;
    fetchPartners();
  }, [filterKey, fetchPartners]);

  const rangeDeliveries = partners.reduce((s, p) => s + p.deliveries_in_range, 0);

  return (
    <div>
      <PageHeader title="Delivery Persons" description={`${partners.length} partner${partners.length !== 1 ? 's' : ''} · ${rangeDeliveries} deliveries in range`}>
        <button onClick={() => fetchPartners()} aria-label="Refresh partners" className="p-2.5 rounded-xl hover:bg-zgray text-ztext-lighter transition-colors">
          <RefreshCw size={18} />
        </button>
      </PageHeader>

      <div className="mb-4">
        <DateFilter onChange={(v) => { setDateRange(v); }} />
      </div>

      <div className="bg-zcard rounded-xl border border-zborder">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-ztext-muted" />
          </div>
        ) : partners.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-ztext-lighter">No delivery partners found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zborder text-left text-[11px] font-semibold text-ztext-lighter uppercase tracking-wide">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Deliveries</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Rating</th>
                  <th className="px-4 py-3 text-right">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zborder">
                {partners.map((p) => (
                  <tr key={p.id} className="hover:bg-zgray transition-colors">
                    <td className="px-4 py-3 font-medium text-ztext">{p.name ?? 'Unnamed'}</td>
                    <td className="px-4 py-3 text-xs text-ztext-light capitalize">{p.vehicle_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      {p.is_online ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">Online</span>
                      ) : p.is_available ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400">Available</span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zgray text-ztext-light">Busy</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ztext">{p.deliveries_in_range}</td>
                    <td className="px-4 py-3 text-right text-xs text-ztext-light">{p.total_deliveries}</td>
                    <td className="px-4 py-3 text-right text-xs text-ztext-light">{p.rating != null ? `${Number(p.rating).toFixed(1)} ★` : '—'}</td>
                    <td className="px-4 py-3 text-right text-xs text-ztext-lighter">{p.phone ?? p.email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}