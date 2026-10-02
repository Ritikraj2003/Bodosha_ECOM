'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  MapPin,
  Navigation,
  Copy,
  Check,
  ExternalLink,
  LocateFixed,
  Phone,
  User,
  X,
  Layers,
  Route,
  Loader2,
} from 'lucide-react';
import { getPreciseDeviceLocation } from '@/lib/device-location';

interface DeliveryMapModalProps {
  trackingCode?: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  lat: number;
  lng: number;
  onClose: () => void;
}

type MapViewMode = 'pin' | 'route' | 'satellite' | 'osm';

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

export default function DeliveryMapModal({
  trackingCode,
  customerName = 'Customer',
  customerPhone,
  address = '',
  lat,
  lng,
  onClose,
}: DeliveryMapModalProps) {
  const [mapMode, setMapMode] = useState<MapViewMode>('pin');
  const [loadingIframe, setLoadingIframe] = useState(true);
  const [copied, setCopied] = useState(false);
  const [riderCoords, setRiderCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingRider, setLocatingRider] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

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
      .catch(() => {
        // GPS permission not granted or timeout; distance remains hidden
      });

    return () => {
      active = false;
    };
  }, [lat, lng]);

  // Copy destination coordinates to clipboard
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

  // Compute map embed URL based on selected mode
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
    if (mapMode === 'osm') {
      const delta = 0.005;
      const minLng = lng - delta;
      const minLat = lat - delta;
      const maxLng = lng + delta;
      const maxLat = lat + delta;
      return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik&marker=${lat}%2C${lng}`;
    }
    // Default: Google Maps centered on destination coordinates
    return `https://maps.google.com/maps?q=${lat},${lng}&hl=en&z=16&output=embed`;
  }, [mapMode, lat, lng, riderCoords]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-zcard border border-zborder rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-z-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zborder bg-zsurface/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Navigation size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ztext">Delivery Destination Map</h3>
              {trackingCode && (
                <p className="text-[11px] font-mono text-ztext-lighter">Order #{trackingCode}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ztext-light hover:text-ztext hover:bg-zsurface transition-colors cursor-pointer"
            aria-label="Close map"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 flex flex-col flex-1 overflow-y-auto space-y-3">
          {/* Destination Coordinates & Customer Address (JUST ABOVE THE MAP) */}
          <div className="rounded-xl bg-zsurface/80 border border-zborder p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Destination GPS Coordinates
              </span>
              <button
                type="button"
                onClick={handleCopyCoords}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zcard border border-zborder hover:border-zborder-hover text-[11px] font-medium text-ztext transition-colors cursor-pointer"
                title="Copy coordinates to clipboard"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy Coords'}
              </button>
            </div>

            {/* Latitude & Longitude Display */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-zcard/90 rounded-lg p-2.5 border border-zborder/60">
                <span className="text-[10px] uppercase font-bold tracking-wider text-ztext-lighter block">
                  Latitude
                </span>
                <span className="text-sm font-mono font-semibold text-emerald-400 block mt-0.5">
                  {lat.toFixed(6)}
                </span>
              </div>
              <div className="bg-zcard/90 rounded-lg p-2.5 border border-zborder/60">
                <span className="text-[10px] uppercase font-bold tracking-wider text-ztext-lighter block">
                  Longitude
                </span>
                <span className="text-sm font-mono font-semibold text-emerald-400 block mt-0.5">
                  {lng.toFixed(6)}
                </span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="pt-2 border-t border-zborder/60 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-ztext font-medium truncate">
                  <User size={13} className="text-zred shrink-0" />
                  <span className="truncate">{customerName}</span>
                </div>
                {customerPhone && (
                  <a
                    href={`tel:${customerPhone}`}
                    className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors shrink-0"
                  >
                    <Phone size={11} /> Call
                  </a>
                )}
              </div>
              {address && (
                <div className="flex items-start gap-1.5 text-ztext-light">
                  <MapPin size={13} className="text-zred shrink-0 mt-0.5" />
                  <span className="leading-snug">{address}</span>
                </div>
              )}
            </div>

            {/* Distance to Customer */}
            {distanceKm !== null && (
              <div className="pt-2 border-t border-zborder/60 flex items-center justify-between text-xs text-blue-400 font-medium">
                <span>Direct Distance to Customer:</span>
                <span className="font-mono font-bold">
                  {distanceKm < 1
                    ? `${Math.round(distanceKm * 1000)} meters`
                    : `${distanceKm.toFixed(2)} km`}
                </span>
              </div>
            )}
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="inline-flex rounded-lg bg-zsurface p-1 border border-zborder text-xs gap-1">
              <button
                type="button"
                onClick={() => {
                  setLoadingIframe(true);
                  setMapMode('pin');
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  mapMode === 'pin'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-ztext-light hover:text-white'
                }`}
              >
                <MapPin size={12} />
                Destination Pin
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoadingIframe(true);
                  setMapMode('route');
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  mapMode === 'route'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-ztext-light hover:text-white'
                }`}
              >
                <Route size={12} />
                Live Route
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoadingIframe(true);
                  setMapMode('satellite');
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  mapMode === 'satellite'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-ztext-light hover:text-white'
                }`}
              >
                <Layers size={12} />
                Satellite
              </button>
            </div>

            <button
              type="button"
              onClick={handleLocateRider}
              disabled={locatingRider}
              className="px-2.5 py-1 rounded-lg bg-zsurface hover:bg-zsurface-hover border border-zborder text-xs text-blue-400 font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Detect your live GPS position and show route"
            >
              {locatingRider ? (
                <Loader2 size={12} className="animate-spin text-blue-400" />
              ) : (
                <LocateFixed size={12} />
              )}
              <span>My GPS Route</span>
            </button>
          </div>

          {/* Interactive In-App Map Display */}
          <div className="relative rounded-xl overflow-hidden border border-zborder bg-[#1a1d24] h-[360px] w-full shrink-0 shadow-inner">
            {loadingIframe && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zcard/90 backdrop-blur-xs text-ztext-light">
                <Loader2 size={24} className="animate-spin text-blue-400 mb-2" />
                <span className="text-xs">Loading in-app map...</span>
              </div>
            )}
            <iframe
              title="Delivery Destination Map"
              src={embedUrl}
              className="w-full h-full border-0"
              loading="lazy"
              allowFullScreen
              onLoad={() => setLoadingIframe(false)}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-zborder bg-zsurface/60 flex items-center justify-between gap-2 shrink-0">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/25 text-xs font-semibold hover:bg-blue-500/20 transition-colors"
          >
            <ExternalLink size={13} />
            Open in Google Maps App
          </a>
          <button
            type="button"
            onClick={onClose}
            className="button-z button-z-primary text-xs h-9 px-5 cursor-pointer"
          >
            Close Map
          </button>
        </div>
      </div>
    </div>
  );
}
