'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapPin, Search, X, Check, Loader2, Navigation, Plus, Minus } from 'lucide-react';
import { getPreciseDeviceLocation } from '@/lib/device-location';

export interface LocationResult {
  address: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  pincode?: string;
  locality?: string;
  addressLine1?: string;
}

interface AddressMapPickerProps {
  initialAddress?: string;
  initialLat?: number | null;
  initialLng?: number | null;
  onSelectLocation: (data: LocationResult) => void;
  onClose?: () => void;
  isInline?: boolean;
}

// Slippy Map Math Helpers
function latLngToPixel(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n * 256;
  const latRad = (lat * Math.PI) / 180;
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const clampedLatRad = (clampedLat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(clampedLatRad) + 1 / Math.cos(clampedLatRad)) / Math.PI) / 2) * n * 256;
  return { x, y };
}

function pixelToLatLng(x: number, y: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const lng = (x / (256 * n)) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / (256 * n))));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

export default function AddressMapPicker({
  initialAddress = '',
  initialLat,
  initialLng,
  onSelectLocation,
  onClose,
  isInline = false,
}: AddressMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Center coordinates (current map camera view)
  const [center, setCenter] = useState<{ lat: number; lng: number }>(() => {
    if (initialLat && initialLng && !isNaN(initialLat) && !isNaN(initialLng)) {
      return { lat: initialLat, lng: initialLng };
    }
    return { lat: 12.89968, lng: 77.60822 };
  });

  // Pin coordinates (the dynamic delivery point placed on the map)
  const [pin, setPin] = useState<{ lat: number; lng: number }>(() => {
    if (initialLat && initialLng && !isNaN(initialLat) && !isNaN(initialLng)) {
      return { lat: initialLat, lng: initialLng };
    }
    return { lat: 12.89968, lng: 77.60822 };
  });

  const [zoom, setZoom] = useState<number>(17);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 600, h: 400 });

  // Screen pixel position of the dynamic pin marker
  const pinScreenPos = useMemo(() => {
    const centerPixel = latLngToPixel(center.lat, center.lng, zoom);
    const pinPixel = latLngToPixel(pin.lat, pin.lng, zoom);
    return {
      x: containerSize.w / 2 + (pinPixel.x - centerPixel.x),
      y: containerSize.h / 2 + (pinPixel.y - centerPixel.y),
    };
  }, [center, pin, zoom, containerSize]);

  // Address details
  const [formattedAddress, setFormattedAddress] = useState<string>(initialAddress);
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [pincode, setPincode] = useState<string>('');
  const [locality, setLocality] = useState<string>('');
  const [addressLine1, setAddressLine1] = useState<string>('');

  // UI state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);
  const [locatingUser, setLocatingUser] = useState<boolean>(false);
  const [geocoding, setGeocoding] = useState<boolean>(false);

  // Drag interaction refs
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startCenter: { lat: number; lng: number };
    isPointerDown: boolean;
  }>({
    startX: 0,
    startY: 0,
    startCenter: center,
    isPointerDown: false,
  });

  // Measure container size
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ w: Math.max(200, rect.width), h: Math.max(150, rect.height) });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Reverse geocoding on drag end or position change
  const reverseGeocode = useCallback((lat: number, lng: number) => {
    setGeocoding(true);
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.display_name) {
          const fullDisplayName = data.display_name;
          setFormattedAddress(fullDisplayName);
          const addr = data.address || {};

          // City detection: city > town > village > city_district > county
          const detectedCity =
            addr.city || addr.town || addr.village || addr.city_district || addr.county || '';
          
          // State detection
          const detectedState = addr.state || '';

          // 6-digit Pincode detection (from addr.postcode or regex on display_name)
          let detectedPincode = addr.postcode || '';
          if (!detectedPincode || !/^\d{6}$/.test(detectedPincode)) {
            const m = fullDisplayName.match(/\b([1-9][0-9]{5})\b/);
            if (m) detectedPincode = m[1];
          }

          // Locality detection: suburb > neighbourhood > quarter > residential
          const detectedLocality =
            addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || '';

          // Build Area & Street addressLine1 intelligently:
          // e.g. "Hongasandra, Bommanahalli" or premise + road + suburb
          const premise = addr.amenity || addr.shop || addr.building || addr.office || addr.house_number;
          const road = addr.road || addr.pedestrian || addr.street;
          const quarter = addr.quarter;
          const suburb = addr.suburb || addr.neighbourhood;

          const localParts = [premise, road, quarter, suburb].filter(Boolean);
          // Remove duplicates
          const uniqueParts = Array.from(new Set(localParts));

          let line1 = '';
          if (uniqueParts.length > 0) {
            line1 = uniqueParts.join(', ');
          } else {
            const segs = fullDisplayName.split(',').map((s: string) => s.trim());
            line1 = segs.slice(0, Math.min(2, segs.length)).join(', ');
          }

          setCity(detectedCity);
          setState(detectedState);
          setPincode(detectedPincode);
          setLocality(detectedLocality);
          setAddressLine1(line1);
        }
      })
      .catch((e) => console.warn('Reverse geocode error:', e))
      .finally(() => setGeocoding(false));
  }, []);

  // Auto-detect user device location on mount if no initial coordinates provided
  useEffect(() => {
    if (initialLat && initialLng && !isNaN(initialLat) && !isNaN(initialLng)) {
      setCenter({ lat: initialLat, lng: initialLng });
      setPin({ lat: initialLat, lng: initialLng });
      reverseGeocode(initialLat, initialLng);
      return;
    }

    setLocatingUser(true);
    getPreciseDeviceLocation()
      .then((loc) => {
        setCenter({ lat: loc.latitude, lng: loc.longitude });
        setPin({ lat: loc.latitude, lng: loc.longitude });
        reverseGeocode(loc.latitude, loc.longitude);
      })
      .catch(() => {
        // Keep default Bengaluru center
        setPin({ lat: 12.89968, lng: 77.60822 });
        reverseGeocode(12.89968, 77.60822);
      })
      .finally(() => setLocatingUser(false));
  }, [initialLat, initialLng, reverseGeocode]);

  const lastWheelTimeRef = useRef<number>(0);

  // Pointer Drag Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only left click
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startCenter: center,
      isPointerDown: true,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.isPointerDown) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    const startPixel = latLngToPixel(
      dragRef.current.startCenter.lat,
      dragRef.current.startCenter.lng,
      zoom
    );

    const newPixel = {
      x: startPixel.x - dx,
      y: startPixel.y - dy,
    };

    const newCenter = pixelToLatLng(newPixel.x, newPixel.y, zoom);
    setCenter(newCenter);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.isPointerDown) return;
    dragRef.current.isPointerDown = false;
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const dist = Math.hypot(dx, dy);

    // CLICK-TO-POINT: User clicked on a specific spot on the map!
    // Move the red pin directly to that clicked spot WITHOUT moving the map!
    if (dist < 6 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const clickOffsetX = e.clientX - centerX;
      const clickOffsetY = e.clientY - centerY;

      const currentCenterPixel = latLngToPixel(center.lat, center.lng, zoom);
      const clickedPixel = {
        x: currentCenterPixel.x + clickOffsetX,
        y: currentCenterPixel.y + clickOffsetY,
      };
      const clickedLatLng = pixelToLatLng(clickedPixel.x, clickedPixel.y, zoom);

      // Pin moves directly to clicked location! Map stays in place!
      setPin(clickedLatLng);
      reverseGeocode(clickedLatLng.lat, clickedLatLng.lng);
      return;
    }

    // DRAG COMPLETED: Map panned, calculate exact final center from drag start
    const startPixel = latLngToPixel(
      dragRef.current.startCenter.lat,
      dragRef.current.startCenter.lng,
      zoom
    );
    const finalPixel = {
      x: startPixel.x - dx,
      y: startPixel.y - dy,
    };
    const finalCenter = pixelToLatLng(finalPixel.x, finalPixel.y, zoom);
    setCenter(finalCenter);
  };

  // Wheel Zoom with smooth step throttling
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 150) return;
    lastWheelTimeRef.current = now;

    if (e.deltaY < 0) {
      setZoom((z) => Math.min(19, z + 1));
    } else if (e.deltaY > 0) {
      setZoom((z) => Math.max(5, z - 1));
    }
  };

  // Double Click Zoom In right onto clicked spot
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const clickOffsetX = e.clientX - centerX;
    const clickOffsetY = e.clientY - centerY;

    const currentCenterPixel = latLngToPixel(center.lat, center.lng, zoom);
    const clickedPixel = {
      x: currentCenterPixel.x + clickOffsetX,
      y: currentCenterPixel.y + clickOffsetY,
    };
    const clickedLatLng = pixelToLatLng(clickedPixel.x, clickedPixel.y, zoom);
    setPin(clickedLatLng);
    setZoom((z) => Math.min(19, z + 1));
    reverseGeocode(clickedLatLng.lat, clickedLatLng.lng);
  };

  // Search Address / Landmark
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery.trim()
        )}&countrycodes=in&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        setCenter({ lat: newLat, lng: newLng });
        setPin({ lat: newLat, lng: newLng });
        setZoom(17);
        reverseGeocode(newLat, newLng);
      } else {
        alert('Location not found. Please try dragging the map to your area.');
      }
    } catch {
      alert('Search failed. Please try dragging the map directly.');
    } finally {
      setSearching(false);
    }
  };

  // Re-center on Device GPS
  const handleLocateMe = async () => {
    setLocatingUser(true);
    try {
      const loc = await getPreciseDeviceLocation();
      setCenter({ lat: loc.latitude, lng: loc.longitude });
      setPin({ lat: loc.latitude, lng: loc.longitude });
      setZoom(18);
      reverseGeocode(loc.latitude, loc.longitude);
    } catch (err: any) {
      alert(err?.message || 'Could not fetch device GPS. Please drag the pin on map.');
    } finally {
      setLocatingUser(false);
    }
  };

  // Confirm Location Handler
  const handleConfirm = () => {
    let finalPincode = pincode;
    if (!finalPincode && formattedAddress) {
      const pinMatch = formattedAddress.match(/\b([1-9][0-9]{5})\b/);
      if (pinMatch) finalPincode = pinMatch[1];
    }

    let finalState = state;
    if (!finalState && formattedAddress) {
      const INDIAN_STATES_LIST = [
        'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
        'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
        'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
        'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra',
        'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab',
        'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
        'Uttarakhand', 'West Bengal'
      ];
      const matched = INDIAN_STATES_LIST.find((st) => formattedAddress.toLowerCase().includes(st.toLowerCase()));
      if (matched) finalState = matched;
    }

    let finalCity = city;
    if (!finalCity && formattedAddress) {
      const parts = formattedAddress.split(',').map((s) => s.trim());
      if (parts.length >= 4) {
        finalCity = parts[parts.length - 4] || parts[parts.length - 3] || '';
      }
    }

    let finalLocality = locality;
    if (!finalLocality && formattedAddress) {
      const parts = formattedAddress.split(',').map((s) => s.trim());
      if (parts.length > 1) {
        finalLocality = parts[1] || parts[0] || '';
      }
    }

    // Send the complete selected delivery point address to addressLine1
    const fullSelectedAddress =
      formattedAddress.trim() || `Location (${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)})`;

    onSelectLocation({
      address: fullSelectedAddress,
      latitude: pin.lat,
      longitude: pin.lng,
      city: finalCity,
      state: finalState,
      pincode: finalPincode,
      locality: finalLocality,
      addressLine1: fullSelectedAddress,
    });
    if (onClose) onClose();
  };

  // Calculate visible tiles for current center, zoom, and container size
  const tiles = useMemo(() => {
    const centerPixel = latLngToPixel(center.lat, center.lng, zoom);
    const tlX = centerPixel.x - containerSize.w / 2;
    const tlY = centerPixel.y - containerSize.h / 2;

    const numTiles = Math.pow(2, zoom);
    const minTileX = Math.floor(tlX / 256);
    const maxTileX = Math.floor((tlX + containerSize.w) / 256);
    const minTileY = Math.max(0, Math.floor(tlY / 256));
    const maxTileY = Math.min(numTiles - 1, Math.floor((tlY + containerSize.h) / 256));

    const tileList: Array<{ key: string; url: string; wrappedX: number; y: number; left: number; top: number }> = [];

    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        const wrappedX = ((x % numTiles) + numTiles) % numTiles;
        const left = Math.round(x * 256 - tlX);
        const top = Math.round(y * 256 - tlY);
        // Google Maps Standard Raster Tiles (No API key required, zero watermark)
        const sub = Math.abs((wrappedX + y) % 4);
        const url = `https://mt${sub}.google.com/vt/lyrs=m&x=${wrappedX}&y=${y}&z=${zoom}`;
        tileList.push({
          key: `${zoom}-${wrappedX}-${y}`,
          url,
          wrappedX,
          y,
          left,
          top,
        });
      }
    }
    return tileList;
  }, [center, zoom, containerSize]);

  const mapBody = (
    <div
      className={`flex flex-col h-full w-full overflow-hidden ${
        !isInline ? 'bg-zcard border border-zborder rounded-2xl shadow-2xl h-[88vh] max-h-[640px]' : ''
      }`}
    >
      {/* 1. Header */}
      {!isInline && (
        <div className="px-4 sm:px-5 py-3 border-b border-zborder flex items-center justify-between bg-zsurface shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shrink-0">
              <MapPin size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-ztext">Pin Delivery Location</h3>
              <p className="text-[11px] text-ztext-light">
                Drag the map to place the red pin on your exact doorstep
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-ztext-light hover:text-ztext hover:bg-zcard transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {/* 2. Clean Search Bar (Free from Google Places errors or warning icons) */}
      <form
        onSubmit={handleSearch}
        className="p-2 sm:p-2.5 bg-zcard border-b border-zborder flex items-center gap-2 shrink-0"
      >
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-light pointer-events-none" />
          <input
            type="text"
            placeholder="Search colony, landmark, area or street..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-2 bg-zsurface border border-zborder rounded-xl text-xs sm:text-sm text-ztext placeholder:text-ztext-light/50 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ztext-light hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="px-3.5 py-2 bg-zsurface hover:bg-zborder border border-zborder text-ztext rounded-xl text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
        >
          {searching ? <Loader2 size={13} className="animate-spin text-blue-500" /> : 'Search'}
        </button>

        <button
          type="button"
          onClick={handleLocateMe}
          disabled={locatingUser}
          className="px-3 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all shadow-md shadow-red-600/20 cursor-pointer disabled:opacity-50"
          title="Detect Your GPS Location"
        >
          {locatingUser ? (
            <Loader2 size={14} className="animate-spin text-white" />
          ) : (
            <Navigation size={14} />
          )}
          <span className="hidden sm:inline">My Location</span>
        </button>
      </form>

      {/* 3. Interactive Slippy Map Canvas */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        className={`relative flex-1 min-h-[220px] w-full bg-[#f2efe9] overflow-hidden select-none touch-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Render Tiles */}
        <div className="absolute inset-0 pointer-events-none">
          {tiles.map((t) => (
            <img
              key={t.key}
              src={t.url}
              alt=""
              loading="lazy"
              draggable={false}
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = 'true';
                  img.src = `https://tile.openstreetmap.org/${zoom}/${t.wrappedX}/${t.y}.png`;
                }
              }}
              className="absolute w-[256px] h-[256px] select-none"
              style={{
                left: `${t.left}px`,
                top: `${t.top}px`,
              }}
            />
          ))}
        </div>

        {/* Loading / Locating Overlay */}
        {locatingUser && (
          <div className="absolute inset-0 bg-zsurface/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-20 pointer-events-none">
            <Loader2 size={24} className="animate-spin text-blue-500" />
            <p className="text-xs font-medium text-ztext">Acquiring your GPS location...</p>
          </div>
        )}

        {/* Floating Helper Banner */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-[11px] text-white shadow-xl pointer-events-none flex items-center gap-1.5 z-10">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Move map or click anywhere to position pin</span>
        </div>

        {/* Zoom Controls (+ / -) */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-4 right-4 flex flex-col bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-neutral-300 overflow-hidden z-20"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => Math.min(19, z + 1));
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 text-neutral-800 hover:bg-neutral-100 active:bg-neutral-200 flex items-center justify-center transition-all cursor-pointer"
            title="Zoom In (+)"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
          <div className="w-full h-px bg-neutral-200" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => Math.max(5, z - 1));
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 text-neutral-800 hover:bg-neutral-100 active:bg-neutral-200 flex items-center justify-center transition-all cursor-pointer"
            title="Zoom Out (-)"
          >
            <Minus size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Re-Center on Device GPS Button */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            handleLocateMe();
          }}
          disabled={locatingUser}
          className="absolute bottom-4 left-4 z-20 px-3.5 py-2 bg-white/95 hover:bg-white text-neutral-900 rounded-xl shadow-xl border border-neutral-300 flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-60"
        >
          <Navigation size={14} className="text-blue-600 fill-blue-600" />
          <span>Locate Me</span>
        </button>

        {/* Dynamic Delivery Pin Marker (Placed exactly at pin coordinates) */}
        <div
          className="absolute pointer-events-none z-30 flex flex-col items-center -translate-x-1/2 -translate-y-full transition-[top,left] duration-150 ease-out"
          style={{
            left: `${pinScreenPos.x}px`,
            top: `${pinScreenPos.y}px`,
          }}
        >
          {/* Animated Badge on the Pin */}
          <div className="mb-1 px-2.5 py-0.5 rounded-full bg-black/85 text-white text-[10px] font-bold whitespace-nowrap shadow-lg flex items-center gap-1 border border-white/20 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>Delivery Point</span>
          </div>

          {/* SVG Marker Pin */}
          <div className="relative">
            <svg
              className="w-10 h-12 drop-shadow-2xl text-red-600 filter"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 7 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
            </svg>
            <div className="absolute top-[8px] left-[13px] w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-inner">
              <div className="w-1.5 h-1.5 bg-red-600 rounded-full" />
            </div>
          </div>

          {/* Pulse Shadow at the Pin Point */}
          <div className="w-3.5 h-1.5 bg-black/50 rounded-full blur-[1px] -mt-0.5" />
        </div>
      </div>

      {/* 4. Footer with Selected Location & Confirm Button */}
      <div className="p-3 bg-zsurface border-t border-zborder shrink-0 space-y-2 z-20">
        <div className="bg-zcard p-2.5 rounded-xl border border-zborder flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <MapPin size={16} className="text-red-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-ztext-light tracking-wider">
                  Selected Delivery Point
                </span>
                {geocoding && <Loader2 size={11} className="animate-spin text-blue-400" />}
              </div>
              <p
                className="text-xs text-ztext font-medium leading-snug line-clamp-2 mt-0.5"
                title={formattedAddress}
              >
                {formattedAddress || 'Click anywhere on map to pinpoint delivery address'}
              </p>
            </div>
          </div>
          <span className="font-mono text-[10px] sm:text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-1 rounded-lg font-semibold shrink-0">
            📍 {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
          </span>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-0.5">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-ztext-light hover:text-ztext hover:bg-zcard transition-colors uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 sm:flex-initial px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all uppercase tracking-wider cursor-pointer"
          >
            <Check size={16} />
            <span>Confirm Location & Fill Form →</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (isInline) {
    return mapBody;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl h-[88vh] max-h-[640px] flex flex-col">
        {mapBody}
      </div>
    </div>
  );
}
