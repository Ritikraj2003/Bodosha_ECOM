'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  MapPin,
  Copy,
  Check,
  ExternalLink,
  LocateFixed,
  Phone,
  User,
  ArrowLeft,
  Layers,
  Route,
  Loader2,
  Navigation,
} from 'lucide-react';
import { getPreciseDeviceLocation } from '@/lib/device-location';

interface DeliveryMapFullPageProps {
  trackingCode?: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  lat: number;
  lng: number;
  onBack: () => void;
}

type MapViewMode = 'pin' | 'route' | 'satellite';

// Calculate distance in kilometers between two GPS coordinates
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function DeliveryMapFullPage({
  trackingCode,
  customerName = 'Customer',
  customerPhone,
  address = '',
  lat,
  lng,
  onBack,
}: DeliveryMapFullPageProps) {
  const [mapMode, setMapMode] = useState<MapViewMode>('pin');
  const [loadingIframe, setLoadingIframe] = useState(true);
  const [copied, setCopied] = useState(false);
  const [riderCoords, setRiderCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingRider, setLocatingRider] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  // Sync with browser back button
  useEffect(() => {
    const handlePopState = () => {
      onBack();
    };
    window.history.pushState({ mapOpen: true }, '');
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onBack]);

  // Auto-detect rider GPS location to compute distance to destination
  useEffect(() => {
    let active = true;
    getPreciseDeviceLocation()
      .then((loc) => {
        if (!active) return;
        setRiderCoords({ lat: loc.latitude, lng: loc.longitude });
        const d = calculateDistanceKm(loc.latitude, loc.longitude, lat, lng);
        setDistanceKm(d);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [lat, lng]);

  // Copy coordinates
  const handleCopyCoords = useCallback(() => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [lat, lng]);

  // Refresh rider GPS
  const handleLocateRider = useCallback(async () => {
    setLocatingRider(true);
    try {
      const loc = await getPreciseDeviceLocation();
      setRiderCoords({ lat: loc.latitude, lng: loc.longitude });
      const d = calculateDistanceKm(loc.latitude, loc.longitude, lat, lng);
      setDistanceKm(d);
      setMapMode('route');
    } catch (err) {
      console.warn('Could not locate rider:', err);
    } finally {
      setLocatingRider(false);
    }
  }, [lat, lng]);

  // Map embed URL
  const embedUrl = useMemo(() => {
    if (mapMode === 'satellite') {
      return `https://maps.google.com/maps?q=${lat},${lng}&hl=en&t=k&z=17&output=embed`;
    }
    if (mapMode === 'route') {
      const origin = riderCoords
        ? `${riderCoords.lat},${riderCoords.lng}`
        : 'Current+Location';
      return `https://maps.google.com/maps?saddr=${origin}&daddr=${lat},${lng}&hl=en&output=embed`;
    }
    return `https://maps.google.com/maps?q=${lat},${lng}&hl=en&z=16&output=embed`;
  }, [mapMode, lat, lng, riderCoords]);

  const googleMapsAppUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

  return (
    <div className="min-h-screen bg-zbg text-ztext flex flex-col pb-10">
      {/* 1. Sleek Sticky Header */}
      <header className="sticky top-0 z-30 bg-zbg/95 backdrop-blur-md border-b border-zborder px-3 sm:px-6 py-2.5 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          {/* Back Button */}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zsurface hover:bg-zsurface-hover border border-zborder text-xs font-bold text-ztext transition-colors shrink-0 cursor-pointer"
          >
            <ArrowLeft size={15} className="text-zred" />
            <span>Dashboard</span>
          </button>

          {/* Title & Order ID */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-ztext truncate">Delivery Map</span>
            {trackingCode && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold shrink-0">
                #{trackingCode}
              </span>
            )}
          </div>

          {/* Quick External Map App Button */}
          <a
            href={googleMapsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 text-xs font-semibold shrink-0 transition-colors"
            title="Open in Google Maps App"
          >
            <ExternalLink size={13} />
            <span className="hidden sm:inline">Google Maps</span>
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto w-full px-3 sm:px-6 py-3 flex-1 flex flex-col space-y-2.5">
        {/* 2. Compact Info Card (Above the Map) */}
        <section className="rounded-xl bg-zcard border border-zborder p-3 space-y-2 shadow-z shrink-0">
          {/* Row 1: Customer Details + Distance Badge */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center gap-1 font-semibold text-ztext truncate">
                <User size={13} className="text-zred shrink-0" />
                <span className="truncate">{customerName}</span>
              </span>
              {customerPhone && (
                <a
                  href={`tel:${customerPhone}`}
                  className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-mono px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 shrink-0"
                >
                  <Phone size={10} />
                  <span>{customerPhone}</span>
                </a>
              )}
            </div>

            {distanceKm !== null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-mono font-bold shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {distanceKm < 1
                  ? `${Math.round(distanceKm * 1000)}m away`
                  : `${distanceKm.toFixed(1)}km away`}
              </span>
            )}
          </div>

          {/* Row 2: Customer Address */}
          {address && (
            <div className="flex items-start gap-1.5 text-xs text-ztext-light leading-snug">
              <MapPin size={13} className="text-zred shrink-0 mt-0.5" />
              <span className="line-clamp-2">{address}</span>
            </div>
          )}

          {/* Row 3: Destination Coordinates Strip (Compact & Clean) */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-zsurface/80 border border-zborder">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] uppercase font-bold text-ztext-lighter shrink-0">
                Destination GPS:
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400 truncate">
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyCoords}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zcard hover:bg-zsurface border border-zborder text-[11px] font-medium text-ztext transition-colors cursor-pointer shrink-0"
            >
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </section>

        {/* 3. Map View Mode Bar */}
        <section className="flex items-center justify-between gap-1.5 shrink-0">
          {/* Segmented Controls */}
          <div className="inline-flex rounded-lg bg-zcard p-1 border border-zborder text-xs gap-1">
            <button
              type="button"
              onClick={() => {
                setLoadingIframe(true);
                setMapMode('pin');
              }}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 cursor-pointer text-xs ${
                mapMode === 'pin'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-ztext-light hover:text-white'
              }`}
            >
              <MapPin size={11} />
              <span>Pin</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLoadingIframe(true);
                setMapMode('route');
              }}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 cursor-pointer text-xs ${
                mapMode === 'route'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-ztext-light hover:text-white'
              }`}
            >
              <Route size={11} />
              <span>Route</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLoadingIframe(true);
                setMapMode('satellite');
              }}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 cursor-pointer text-xs ${
                mapMode === 'satellite'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-ztext-light hover:text-white'
              }`}
            >
              <Layers size={11} />
              <span>Satellite</span>
            </button>
          </div>

          {/* Locate Rider Button */}
          <button
            type="button"
            onClick={handleLocateRider}
            disabled={locatingRider}
            className="px-2.5 py-1 rounded-lg bg-zcard hover:bg-zsurface border border-zborder text-xs text-blue-400 font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            {locatingRider ? (
              <Loader2 size={11} className="animate-spin text-blue-400" />
            ) : (
              <LocateFixed size={11} />
            )}
            <span className="hidden sm:inline">My GPS Route</span>
            <span className="sm:hidden">My GPS</span>
          </button>
        </section>

        {/* 4. Large In-App Map (Primary Viewport) */}
        <section className="relative rounded-2xl overflow-hidden border border-zborder bg-[#1a1d24] w-full h-[calc(100vh-280px)] min-h-[460px] max-h-[740px] shadow-z">
          {loadingIframe && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zcard/90 backdrop-blur-xs text-ztext-light">
              <Loader2 size={24} className="animate-spin text-blue-400 mb-2" />
              <span className="text-xs font-medium">Loading destination map...</span>
            </div>
          )}
          <iframe
            title="Delivery Destination Map"
            src={embedUrl}
            className="absolute inset-0 w-full h-full border-0 block"
            style={{ width: '100%', height: '100%' }}
            loading="lazy"
            allowFullScreen
            onLoad={() => setLoadingIframe(false)}
          />
        </section>

        {/* 5. Bottom Navigation Bar */}
        <footer className="pt-1 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="button-z button-z-primary text-xs h-10 px-5 font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Back to Dashboard</span>
          </button>

          <a
            href={googleMapsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button-z button-z-outline text-xs h-10 px-4 flex items-center gap-1.5 text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
          >
            <Navigation size={13} />
            <span>Turn-by-turn Navigation</span>
          </a>
        </footer>
      </main>
    </div>
  );
}
