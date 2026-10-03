'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Navigation, MapPin, Loader2, Check } from 'lucide-react';
import type { Address } from '@/types';
import type { AddressInput } from '../actions';
import { getPreciseDeviceLocation } from '@/lib/device-location';
import dynamic from 'next/dynamic';
import type { LocationResult } from '@/components/maps/AddressMapPicker';

const AddressMapPicker = dynamic(() => import('@/components/maps/AddressMapPicker'), { ssr: false });

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

interface AddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (addressData: AddressInput) => Promise<{ success: boolean; error?: string }>;
  initialData?: Address | null;
  defaultName?: string;
  defaultPhone?: string;
}

export default function AddressModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  defaultName = '',
  defaultPhone = '',
}: AddressModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [locality, setLocality] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [landmark, setLandmark] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [label, setLabel] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [isDefault, setIsDefault] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [showMapModal, setShowMapModal] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [geoPermission, setGeoPermission] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');

  const [mapSuccessMsg, setMapSuccessMsg] = useState('');
  const userPinnedOnMap = useRef(false);
  const hasAutoRequestedLoc = useRef(false);

  // Monitor browser geolocation permission state
  useEffect(() => {
    if (!isOpen) return;

    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          setGeoPermission(status.state as any);
          status.onchange = () => {
            setGeoPermission(status.state as any);
          };
        })
        .catch(() => {
          setGeoPermission('unknown');
        });
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || defaultName);
      setPhone(initialData.phone || defaultPhone);
      setPostalCode(initialData.postalCode || '');
      setLocality(initialData.locality || '');
      setAddressLine1(initialData.addressLine1 || initialData.fullAddress || '');
      setCity(initialData.city || '');
      setState(initialData.state || '');
      setLandmark(initialData.landmark || '');
      setAlternatePhone(initialData.alternatePhone || '');
      setLabel((initialData.label as any) || 'Home');
      setIsDefault(Boolean(initialData.isDefault));
      setLatitude(initialData.latitude ?? null);
      setLongitude(initialData.longitude ?? null);
    } else {
      setName(defaultName);
      setPhone(defaultPhone);
      setPostalCode('');
      setLocality('');
      setAddressLine1('');
      setCity('');
      setState('');
      setLandmark('');
      setAlternatePhone('');
      setLabel('Home');
      setIsDefault(true);
      setLatitude(null);
      setLongitude(null);
    }
    setError('');
    setMapSuccessMsg('');
    userPinnedOnMap.current = false;
  }, [initialData, defaultName, defaultPhone, isOpen]);

  // As soon as user opens modal to add an address, automatically ask for device location
  useEffect(() => {
    if (!isOpen) {
      hasAutoRequestedLoc.current = false;
      return;
    }

    if (!initialData && !hasAutoRequestedLoc.current) {
      hasAutoRequestedLoc.current = true;
      handleUseCurrentLocation();
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  async function fillFromCoords(lat: number, lng: number) {
    // If user already pinned on map, don't overwrite with background geocode
    if (userPinnedOnMap.current) return;

    setLatitude(lat);
    setLongitude(lng);

    // 1. Try Google Maps Geocoder if loaded on page
    if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
      try {
        const geocoder = new (window as any).google.maps.Geocoder();
        const results = await new Promise<any[]>((resolve, reject) => {
          geocoder.geocode({ location: { lat, lng } }, (res: any[], status: string) => {
            if (status === 'OK' && res && res.length > 0) resolve(res);
            else reject(status);
          });
        });

        if (userPinnedOnMap.current) return;

        if (results && results[0]) {
          const res = results[0];
          let detectedPincode = '';
          let detectedCity = '';
          let detectedState = '';
          let detectedLocality = '';
          let detectedRoute = '';
          let detectedBuilding = '';

          for (const comp of res.address_components || []) {
            if (comp.types.includes('postal_code')) detectedPincode = comp.long_name;
            if (comp.types.includes('locality')) detectedCity = comp.long_name;
            if (comp.types.includes('administrative_area_level_1')) detectedState = comp.long_name;
            if (comp.types.includes('sublocality_level_1') || comp.types.includes('sublocality')) detectedLocality = comp.long_name;
            if (comp.types.includes('route')) detectedRoute = comp.long_name;
            if (comp.types.includes('premise') || comp.types.includes('point_of_interest') || comp.types.includes('establishment')) {
              detectedBuilding = comp.long_name;
            }
          }

          if (detectedPincode) setPostalCode(detectedPincode);
          if (detectedCity) setCity(detectedCity);
          if (detectedLocality) setLocality(detectedLocality);
          const line1 = res.formatted_address || [detectedBuilding, detectedRoute, detectedLocality].filter(Boolean).join(', ');
          if (line1) setAddressLine1(line1);

          if (detectedState) {
            const matched = INDIAN_STATES.find(
              (s) => s.toLowerCase() === detectedState.toLowerCase() || detectedState.toLowerCase().includes(s.toLowerCase())
            );
            if (matched) setState(matched);
            else setState(detectedState);
          }
          return;
        }
      } catch (gErr) {
        console.warn('Google reverse geocode fallback to Nominatim:', gErr);
      }
    }

    // 2. OpenStreetMap Nominatim Geocoder fallback
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' },
      });
      if (userPinnedOnMap.current) return;
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};

        const fetchedPostcode = addr.postcode || '';
        const fetchedCity = addr.city || addr.town || addr.village || addr.city_district || addr.county || '';
        const fetchedState = addr.state || '';
        const fetchedLocality = addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || '';

        const fullDisplayAddress = data.display_name || '';

        if (fetchedPostcode) setPostalCode(fetchedPostcode);
        if (fetchedCity) setCity(fetchedCity);
        if (fetchedLocality) setLocality(fetchedLocality);
        if (fullDisplayAddress) setAddressLine1(fullDisplayAddress);

        const matchedState = INDIAN_STATES.find(
          (s) => s.toLowerCase() === fetchedState.toLowerCase() || fetchedState.toLowerCase().includes(s.toLowerCase())
        );
        if (matchedState) setState(matchedState);
        else if (fetchedState) setState(fetchedState);
      }
    } catch (e) {
      console.error('Reverse geocode error:', e);
    }
  }

  async function handleUseCurrentLocation() {
    setLocating(true);
    setError('');

    try {
      const loc = await getPreciseDeviceLocation();
      setGeoPermission('granted');
      await fillFromCoords(loc.latitude, loc.longitude);
      setError('');
    } catch (err: any) {
      console.warn('Location detection warning:', err);
      setGeoPermission('denied');
      setError(err?.message || 'Location access was denied. Please enter Latitude and Longitude manually below.');
    } finally {
      setLocating(false);
    }
  }

  function handleMapPicked(data: LocationResult) {
    userPinnedOnMap.current = true;
    setLocating(false);
    setError('');
    setMapSuccessMsg('Location & address details pinned from map! Please verify details and click Save.');

    // 1. Directly patch the Latitude and Longitude into input boxes
    setLatitude(data.latitude);
    setLongitude(data.longitude);

    // 2. Patch complete address into Address (Area and Street)
    const fullSelectedAddress = data.address || data.addressLine1 || '';
    if (fullSelectedAddress) {
      setAddressLine1(fullSelectedAddress);
    }

    if (data.locality) {
      setLocality(data.locality);
    }

    if (data.city) {
      setCity(data.city);
    }

    if (data.state) {
      const matched = INDIAN_STATES.find(
        (s) => s.toLowerCase() === data.state?.toLowerCase() || data.state?.toLowerCase().includes(s.toLowerCase())
      );
      if (matched) setState(matched);
      else setState(data.state);
    }

    if (data.pincode) {
      setPostalCode(data.pincode);
    }

    setGeoPermission('granted');
    setShowMapModal(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cleanPhone = phone.replace(/\D/g, '');
    if (!name.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }
    if (!postalCode.trim()) {
      setError('Please enter your 6-digit Pincode');
      return;
    }
    if (!addressLine1.trim()) {
      setError('Please enter your Area and Street address');
      return;
    }
    if (!city.trim()) {
      setError('Please enter your City / District');
      return;
    }
    if (!state.trim()) {
      setError('Please select your State');
      return;
    }

    setSaving(true);
    const result = await onSave({
      id: initialData?.id,
      name: name.trim(),
      phone: cleanPhone,
      alternatePhone: alternatePhone.trim() || undefined,
      postalCode: postalCode.trim(),
      locality: locality.trim() || undefined,
      addressLine1: addressLine1.trim(),
      city: city.trim(),
      state: state.trim(),
      landmark: landmark.trim() || undefined,
      label,
      latitude,
      longitude,
      isDefault,
    });

    setSaving(false);
    if (!result.success) {
      setError(result.error || 'Failed to save address');
    } else {
      onClose();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
        <div className="bg-zcard border border-zborder rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-zborder flex items-center justify-between bg-zcard-inner shrink-0">
            <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-ztext flex items-center gap-2">
              <MapPin size={18} className="text-blue-500" />
              {initialData ? 'Edit Address' : 'Add A New Address'}
            </h2>
            <button
              onClick={onClose}
              disabled={saving}
              className="p-1.5 rounded-lg text-ztext-light hover:text-ztext hover:bg-zgray transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
            {error && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs flex items-center justify-between gap-2 text-amber-300">
                <span className="font-semibold">{error}</span>
                <button
                  type="button"
                  onClick={() => setError('')}
                  className="p-1 hover:bg-amber-500/20 rounded text-amber-400"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {mapSuccessMsg && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/35 rounded-xl text-xs flex items-center justify-between gap-2 text-emerald-300 animate-fade-in">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-emerald-400 shrink-0" />
                  <span className="font-semibold">{mapSuccessMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMapSuccessMsg('')}
                  className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Top Location Fetcher Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locating || saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {locating ? <Loader2 size={16} className="animate-spin text-white" /> : <Navigation size={16} />}
                <span>{locating ? 'Detecting Location...' : 'Use Current Location'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowMapModal(true)}
                className="px-4 py-3 bg-zsurface hover:bg-zcard border border-zborder text-ztext rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
              >
                <MapPin size={16} className="text-red-500" />
                <span>Pin from Map</span>
              </button>
            </div>

            {/* Locating banner */}
            {locating && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-3 animate-pulse">
                <Loader2 size={18} className="animate-spin text-blue-400 shrink-0" />
                <div className="text-xs text-blue-200">
                  <span className="font-bold">Requesting device location...</span>
                  <p className="text-[11px] text-blue-300/80">Please click "Allow" on the browser popup to auto-fill Latitude & Longitude.</p>
                </div>
              </div>
            )}

            {/* Direct GPS Coordinates: Latitude & Longitude Input Boxes */}
            <div className="p-3.5 bg-zsurface/80 border border-zborder rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-blue-500" />
                  <span className="text-xs font-bold text-ztext uppercase tracking-wider">
                    GPS Coordinates
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMapModal(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 text-[11px] font-semibold text-blue-400 transition-colors cursor-pointer"
                    title="Open interactive map to choose pin location"
                  >
                    <MapPin size={11} className="text-red-400" />
                    <span>Pin on Map</span>
                  </button>
                </div>
                {/* Dynamic Permission Status Badge */}
                {geoPermission === 'granted' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-[11px] font-bold text-emerald-400 font-mono shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    GPS Permission Granted
                  </span>
                ) : geoPermission === 'denied' ? (
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={locating}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-[11px] font-bold text-rose-300 transition-all cursor-pointer active:scale-95 shadow-sm"
                    title="Permission was blocked. Click to re-request"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span>Permission Blocked (Click to Retry)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={locating}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-[11px] font-bold text-amber-300 transition-all cursor-pointer active:scale-95 shadow-sm"
                    title="Click to allow device location permission"
                  >
                    {locating ? (
                      <Loader2 size={12} className="animate-spin text-amber-400" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    )}
                    <span>{locating ? 'Requesting...' : 'Allow GPS Permission'}</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={latitude !== null ? latitude : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLatitude(val === '' ? null : parseFloat(val));
                    }}
                    placeholder="e.g. 12.89949"
                    className="w-full px-3.5 py-2.5 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm font-mono text-ztext placeholder:text-ztext-light/40 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={longitude !== null ? longitude : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLongitude(val === '' ? null : parseFloat(val));
                    }}
                    placeholder="e.g. 77.60812"
                    className="w-full px-3.5 py-2.5 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm font-mono text-ztext placeholder:text-ztext-light/40 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
              <p className="text-[11px] text-ztext-light">
                Auto-filled via "Use Current Location" or enter coordinates manually.
              </p>
            </div>

            {/* Row 1: Name & 10-digit mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm text-ztext placeholder-ztext-muted focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                  10-digit mobile number *
                </label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full px-3.5 py-2.5 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm text-ztext placeholder-ztext-muted focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Row 2: Pincode & Locality */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                  Pincode *
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="6-digit Pincode"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-3.5 py-2.5 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm text-ztext placeholder-ztext-muted focus:outline-none focus:border-blue-500 transition-colors font-mono font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                  Locality
                </label>
                <input
                  type="text"
                  placeholder="Locality / Sector / Area"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm text-ztext placeholder-ztext-muted focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Row 3: Address (Area and Street) */}
            <div>
              <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                Address (Area and Street) *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Flat / House No. / Building Name, Street / Road"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                className="w-full px-3.5 py-2 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm text-ztext placeholder-ztext-muted focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>

            {/* Row 4: City/District/Town & State */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                  City / District / Town *
                </label>
                <input
                  type="text"
                  required
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm text-ztext placeholder-ztext-muted focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                  State *
                </label>
                <select
                  required
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm text-ztext focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="" className="bg-zcard text-ztext-muted">Select State</option>
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st} className="bg-zcard text-ztext">
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 5: Landmark (Optional) & Alternate Phone (Optional) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                  Landmark (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Near Oxford Parlour"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm text-ztext placeholder-ztext-muted focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-1">
                  Alternate Phone (Optional)
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="10-digit alternate mobile"
                  value={alternatePhone}
                  onChange={(e) => setAlternatePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full px-3.5 py-2.5 bg-zcard border border-zborder rounded-xl text-xs sm:text-sm text-ztext placeholder-ztext-muted focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Address Type (Home / Work / Other) */}
            <div>
              <label className="block text-[11px] font-semibold text-ztext-light uppercase tracking-wider mb-2">
                Address Type
              </label>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm text-ztext">
                  <input
                    type="radio"
                    name="addressType"
                    value="Home"
                    checked={label === 'Home'}
                    onChange={() => setLabel('Home')}
                    className="accent-blue-600 w-4 h-4 cursor-pointer"
                  />
                  <span>Home</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm text-ztext">
                  <input
                    type="radio"
                    name="addressType"
                    value="Work"
                    checked={label === 'Work'}
                    onChange={() => setLabel('Work')}
                    className="accent-blue-600 w-4 h-4 cursor-pointer"
                  />
                  <span>Work</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm text-ztext">
                  <input
                    type="radio"
                    name="addressType"
                    value="Other"
                    checked={label === 'Other'}
                    onChange={() => setLabel('Other')}
                    className="accent-blue-600 w-4 h-4 cursor-pointer"
                  />
                  <span>Other</span>
                </label>
              </div>
            </div>

            {/* Set as Default Checkbox */}
            <label className="flex items-center gap-2.5 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
              />
              <span className="text-xs text-ztext-light font-medium">
                Make this my default delivery address
              </span>
            </label>

            {/* Action Buttons: SAVE and CANCEL */}
            <div className="flex items-center gap-3 pt-4 border-t border-zborder">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-blue-600/25 transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                <span>{saving ? 'Saving...' : 'Save'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-6 py-3 text-ztext-light hover:text-ztext font-semibold rounded-xl text-xs sm:text-sm transition-colors uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Interactive Google Map Picker Modal */}
      {showMapModal && (
        <AddressMapPicker
          initialLat={latitude || undefined}
          initialLng={longitude || undefined}
          initialAddress={[addressLine1, locality, city, state].filter(Boolean).join(', ')}
          onSelectLocation={handleMapPicked}
          onClose={() => setShowMapModal(false)}
        />
      )}
    </>
  );
}
