'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, Search, X, Check, Loader2, AlertCircle } from 'lucide-react';
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

declare global {
  interface Window {
    google?: any;
    L?: any;
    gm_authFailure?: () => void;
  }
}

export default function AddressMapPicker({
  initialAddress = '',
  initialLat,
  initialLng,
  onSelectLocation,
  onClose,
  isInline = false,
}: AddressMapPickerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic user coordinates (no hardcoded locations)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() => {
    if (initialLat && initialLng && !isNaN(initialLat) && !isNaN(initialLng)) {
      return { lat: initialLat, lng: initialLng };
    }
    return null;
  });

  const [formattedAddress, setFormattedAddress] = useState<string>(initialAddress);
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [pincode, setPincode] = useState<string>('');
  const [locality, setLocality] = useState<string>('');
  const [addressLine1, setAddressLine1] = useState<string>('');

  const [loadingMap, setLoadingMap] = useState<boolean>(true);
  const [locatingUser, setLocatingUser] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);
  const [useOsmMode, setUseOsmMode] = useState<boolean>(false);
  const [authFailed, setAuthFailed] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Map instances
  const googleMapInstance = useRef<any>(null);
  const googleMarkerInstance = useRef<any>(null);
  const leafletMapInstance = useRef<any>(null);
  const leafletMarkerInstance = useRef<any>(null);

  // Reverse geocode to get street address from coordinates
  const reverseGeocode = useCallback((lat: number, lng: number) => {
    if (window.google?.maps?.Geocoder && !authFailed) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
        if (status === 'OK' && results && results[0]) {
          const res = results[0];
          setFormattedAddress(res.formatted_address);

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
            if (comp.types.includes('sublocality_level_1')) detectedLocality = comp.long_name;
            if (comp.types.includes('route')) detectedRoute = comp.long_name;
            if (comp.types.includes('premise') || comp.types.includes('point_of_interest') || comp.types.includes('establishment')) {
              detectedBuilding = comp.long_name;
            }
          }

          if (detectedCity) setCity(detectedCity);
          if (detectedState) setState(detectedState);
          if (detectedPincode) setPincode(detectedPincode);
          if (detectedLocality) setLocality(detectedLocality);
          const line1 = [detectedBuilding, detectedRoute, detectedLocality].filter(Boolean).join(', ') || res.formatted_address.split(',')[0];
          setAddressLine1(line1);
          return;
        }
        fetchOsmReverse(lat, lng);
      });
    } else {
      fetchOsmReverse(lat, lng);
    }
  }, [authFailed]);

  const fetchOsmReverse = (lat: number, lng: number) => {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.display_name) {
          setFormattedAddress(data.display_name);
          const addr = data.address || {};
          const detectedCity = addr.city || addr.town || addr.village || addr.city_district || addr.county || '';
          const detectedState = addr.state || '';
          const detectedPincode = addr.postcode || '';
          const detectedLocality = addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || '';

          const parts = [
            addr.amenity || addr.shop || addr.building || addr.office,
            addr.road || addr.pedestrian,
            addr.suburb || addr.neighbourhood,
          ].filter(Boolean);
          const line1 = parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(', ');

          setCity(detectedCity);
          setState(detectedState);
          setPincode(detectedPincode);
          setLocality(detectedLocality);
          setAddressLine1(line1);
        }
      })
      .catch(() => {});
  };

  // Update pin and coordinates
  const handlePositionChange = useCallback(
    (lat: number, lng: number, shouldGeocode = true) => {
      setCoords({ lat, lng });

      // Update Google marker if active
      if (googleMapInstance.current && googleMarkerInstance.current) {
        const newPos = new window.google.maps.LatLng(lat, lng);
        googleMapInstance.current.panTo(newPos);
        googleMarkerInstance.current.setPosition(newPos);
      }

      // Update Leaflet marker if active
      if (leafletMapInstance.current && leafletMarkerInstance.current) {
        leafletMapInstance.current.setView([lat, lng], leafletMapInstance.current.getZoom());
        leafletMarkerInstance.current.setLatLng([lat, lng]);
      }

      if (shouldGeocode) {
        reverseGeocode(lat, lng);
      }
    },
    [reverseGeocode]
  );

  // 1. DYNAMIC USER GPS: Fetch user's real location or initial address when map opens
  useEffect(() => {
    if (initialLat && initialLng && !isNaN(initialLat) && !isNaN(initialLng)) {
      setCoords({ lat: initialLat, lng: initialLng });
      setLocatingUser(false);
      return;
    }

    setLocatingUser(true);

    getPreciseDeviceLocation()
      .then((loc) => {
        setCoords({ lat: loc.latitude, lng: loc.longitude });
        setLocatingUser(false);
        reverseGeocode(loc.latitude, loc.longitude);
      })
      .catch((err) => {
        console.warn('Device location auto-detect failed:', err);
        // Fallback to initialAddress if provided
        if (initialAddress && initialAddress.trim().length > 3) {
          fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              initialAddress
            )}&countrycodes=in&limit=1`
          )
            .then((r) => r.json())
            .then((data) => {
              if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                setCoords({ lat, lng });
                setFormattedAddress(data[0].display_name);
              } else {
                setCoords({ lat: 12.89968, lng: 77.60831 }); // Bilekahalli, Bengaluru
              }
            })
            .catch(() => {
              setCoords({ lat: 12.89968, lng: 77.60831 });
            })
            .finally(() => setLocatingUser(false));
        } else {
          setCoords({ lat: 12.89968, lng: 77.60831 }); // Bilekahalli, Bengaluru
          setLocatingUser(false);
        }
      });
  }, [initialAddress, initialLat, initialLng, reverseGeocode]);

  // Load Leaflet map
  const initLeafletMap = useCallback((currentCoords: { lat: number; lng: number }) => {
    if (!mapRef.current) return;

    const setupL = () => {
      if (!window.L || !mapRef.current) return;
      if (leafletMapInstance.current) {
        leafletMapInstance.current.remove();
        leafletMapInstance.current = null;
      }

      mapRef.current.innerHTML = '';

      const L = window.L;
      const map = L.map(mapRef.current).setView([currentCoords.lat, currentCoords.lng], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // Custom Red Pin Icon
      const redIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: `<div style="background-color: #ef4444; width: 22px; height: 22px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.5);"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });

      const marker = L.marker([currentCoords.lat, currentCoords.lng], {
        draggable: true,
        icon: redIcon,
      }).addTo(map);

      leafletMapInstance.current = map;
      leafletMarkerInstance.current = marker;

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        handlePositionChange(pos.lat, pos.lng, true);
      });

      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        handlePositionChange(e.latlng.lat, e.latlng.lng, true);
      });

      setTimeout(() => map.invalidateSize(), 200);
      setLoadingMap(false);
    };

    if (window.L) {
      setupL();
    } else {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('leaflet-js')) {
        const script = document.createElement('script');
        script.id = 'leaflet-js';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = setupL;
        document.head.appendChild(script);
      } else {
        const check = setInterval(() => {
          if (window.L) {
            clearInterval(check);
            setupL();
          }
        }, 100);
      }
    }
  }, [handlePositionChange]);

  // Listen for Google Auth Failure (e.g. no billing on Google Cloud project)
  useEffect(() => {
    window.gm_authFailure = () => {
      console.warn('Google Maps auth failure detected. Switching to OpenStreetMap engine.');
      setAuthFailed(true);
      setUseOsmMode(true);
    };
  }, []);

  // Initialize Map (Google Maps or OpenStreetMap fallback)
  useEffect(() => {
    if (!coords) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey || useOsmMode || authFailed) {
      initLeafletMap(coords);
      return;
    }

    const scriptId = 'google-maps-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const setupGoogle = () => {
      if (!window.google?.maps || !mapRef.current) {
        initLeafletMap(coords);
        return;
      }

      try {
        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: coords.lat, lng: coords.lng },
          zoom: 17,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        const marker = new window.google.maps.Marker({
          position: { lat: coords.lat, lng: coords.lng },
          map,
          draggable: true,
          animation: window.google.maps.Animation.DROP,
          title: 'Delivery Location',
        });

        googleMapInstance.current = map;
        googleMarkerInstance.current = marker;

        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) handlePositionChange(pos.lat(), pos.lng(), true);
        });

        map.addListener('click', (e: any) => {
          if (e.latLng) handlePositionChange(e.latLng.lat(), e.latLng.lng(), true);
        });

        // Places Autocomplete
        if (searchInputRef.current && window.google.maps.places) {
          const autocomplete = new window.google.maps.places.Autocomplete(
            searchInputRef.current,
            { types: ['geocode', 'establishment'], componentRestrictions: { country: 'in' } }
          );
          autocomplete.bindTo('bounds', map);
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry && place.geometry.location) {
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              handlePositionChange(lat, lng, false);
              setFormattedAddress(place.formatted_address || place.name || '');
            }
          });
        }

        setLoadingMap(false);
      } catch (e) {
        console.error('Google Map setup failed, switching to OSM:', e);
        setUseOsmMode(true);
      }
    };

    if (window.google?.maps) {
      setupGoogle();
    } else {
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = setupGoogle;
        script.onerror = () => setUseOsmMode(true);
        document.head.appendChild(script);
      } else {
        script.addEventListener('load', setupGoogle);
      }
    }
  }, [coords, useOsmMode, authFailed, handlePositionChange, initLeafletMap]);

  // Handle Search submit
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery.trim()
        )}&countrycodes=in&limit=1`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        handlePositionChange(lat, lng, false);
        setFormattedAddress(item.display_name);
      } else {
        alert('Location not found. Please try dragging the pin directly on the map.');
      }
    } catch {
      alert('Could not search location. Please try dragging the pin.');
    } finally {
      setSearching(false);
    }
  };

  // Re-fetch Live GPS
  const handleReLocate = async () => {
    setLocatingUser(true);
    setErrorMsg('');
    try {
      const loc = await getPreciseDeviceLocation();
      handlePositionChange(loc.latitude, loc.longitude, true);
      if (googleMapInstance.current) {
        googleMapInstance.current.setZoom(17);
      }
      if (leafletMapInstance.current) {
        leafletMapInstance.current.setZoom(17);
      }
    } catch (err: any) {
      console.warn('GPS location request error:', err);
      if (err?.isPermissionDenied) {
        setErrorMsg('Location access is blocked in Windows or Browser. Tap anywhere on map or drag pin.');
      } else {
        setErrorMsg('Could not detect device GPS. Please drag the pin or search your area.');
      }
    } finally {
      setLocatingUser(false);
    }
  };

  const handleConfirm = () => {
    if (!coords) return;
    onSelectLocation({
      address: formattedAddress.trim() || `Coordinates: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
      latitude: coords.lat,
      longitude: coords.lng,
      city,
      state,
      pincode,
      locality,
      addressLine1,
    });
    if (onClose) {
      onClose();
    }
  };

  const mapBody = (
    <div className={`flex flex-col h-full w-full overflow-hidden ${!isInline ? 'bg-zcard border border-zborder rounded-2xl shadow-2xl h-[88vh] max-h-[600px] sm:max-h-[640px]' : ''}`}>
      {/* Header - only show if NOT isInline */}
      {!isInline && (
        <div className="px-4 sm:px-5 py-3 border-b border-zborder flex items-center justify-between bg-zsurface shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shrink-0">
              <MapPin size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-ztext">Pin Delivery Location</h3>
              <p className="text-[11px] text-ztext-light">
                {locatingUser ? 'Detecting your device GPS location...' : 'Drag the red pin to your exact room / building'}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-ztext-light hover:text-ztext hover:bg-zcard transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {/* Search Bar & GPS Button */}
      <form onSubmit={handleSearchSubmit} className="p-2 sm:p-2.5 bg-zcard border-b border-zborder flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-light" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search hostel, colony, landmark or area..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-z w-full pl-8 sm:pl-9 text-xs sm:text-sm h-8 sm:h-9"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="button-z button-z-secondary h-8 sm:h-9 px-3 text-xs shrink-0 font-medium"
        >
          {searching ? <Loader2 size={13} className="animate-spin text-zred" /> : 'Search'}
        </button>
        <button
          type="button"
          onClick={handleReLocate}
          disabled={locatingUser}
          className="h-8 sm:h-9 px-2.5 sm:px-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs flex items-center gap-1.5 shrink-0 font-bold transition-all shadow-md shadow-red-600/20 cursor-pointer"
          title="Detect Your Location"
        >
          {locatingUser ? (
            <Loader2 size={13} className="animate-spin text-white" />
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
          )}
          <span>Your Location</span>
        </button>
      </form>

      {/* Notification if switched to OpenStreetMap fallback */}
      {authFailed && (
        <div className="px-3 py-1 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-[10px] sm:text-[11px] flex items-center justify-between shrink-0">
          <span className="flex items-center gap-1.5">
            <AlertCircle size={12} />
            <span>OpenStreetMap Active (Free Map Service).</span>
          </span>
          <span className="font-semibold">GPS Active</span>
        </div>
      )}

      {/* Error notification banner if location blocked */}
      {errorMsg && (
        <div className="px-3 py-1.5 bg-red-500/15 border-b border-red-500/25 text-red-400 text-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle size={14} className="shrink-0 text-red-400" />
            <span className="truncate">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-red-400 hover:text-white text-xs ml-2 px-1 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Map Container - min-h-0 allows flexbox to shrink without cutting off the footer */}
      <div className="relative flex-1 min-h-[160px] min-w-0 bg-zsurface flex items-center justify-center overflow-hidden">
        <div ref={mapRef} className="w-full h-full" />

        {(loadingMap || locatingUser) && (
          <div className="absolute inset-0 bg-zsurface/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10">
            <Loader2 size={24} className="animate-spin text-zred" />
            <p className="text-xs font-medium text-ztext">
              {locatingUser ? 'Acquiring your GPS location...' : 'Loading Interactive Map...'}
            </p>
          </div>
        )}

        {/* Floating Helper */}
        {!loadingMap && !locatingUser && (
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-[11px] text-white shadow-lg pointer-events-none flex items-center gap-1.5 z-10">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Drag pin or tap map to adjust delivery point</span>
          </div>
        )}

        {/* Floating "Your Location" Crosshair Target Button on Map (Google Maps Style) */}
        <button
          type="button"
          onClick={handleReLocate}
          disabled={locatingUser}
          className="absolute bottom-3 right-3 z-10 p-2 sm:px-3 sm:py-2 bg-white hover:bg-neutral-50 active:scale-95 rounded-xl shadow-xl border border-neutral-200 flex items-center gap-1.5 transition-all cursor-pointer group"
          title="Your Location"
          aria-label="Your Location"
        >
          {locatingUser ? (
            <Loader2 size={18} className="animate-spin text-blue-600" />
          ) : (
            <div className="relative flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="7" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
                <line x1="12" y1="2" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="2" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22" y2="12" />
              </svg>
            </div>
          )}
          <span className="text-xs font-semibold text-neutral-800 hidden sm:inline">Your Location</span>
        </button>
      </div>

      {/* Selected Address & Confirm Footer - ALWAYS VISIBLE */}
      <div className="p-2.5 sm:p-3 bg-zsurface border-t border-zborder shrink-0 space-y-2 z-20">
        <div className="bg-zcard p-2 sm:p-2.5 rounded-xl border border-zborder flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5 flex-1 min-w-0">
            <MapPin size={14} className="text-red-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase font-bold text-ztext-light tracking-wider">Selected Delivery Location</p>
              <p className="text-xs text-ztext font-medium leading-snug line-clamp-2 mt-0.5" title={formattedAddress}>
                {formattedAddress || 'Tap map or drag pin to select address'}
              </p>
            </div>
          </div>
          {coords && (
            <span className="font-mono text-[9px] sm:text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-semibold shrink-0">
              📍 {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 pt-0.5">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold text-ztext-light hover:text-ztext hover:bg-zcard transition-colors uppercase tracking-wider"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!coords}
            className="flex-1 sm:flex-initial px-5 sm:px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all uppercase tracking-wider cursor-pointer disabled:opacity-50"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl h-[88vh] max-h-[600px] sm:max-h-[640px] flex flex-col">
        {mapBody}
      </div>
    </div>
  );
}
