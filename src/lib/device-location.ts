import { getApproximateServerLocation } from '@/features/addresses/actions';

export interface DeviceCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  isApproximate?: boolean;
}

export interface LocationError {
  code: number;
  message: string;
  isPermissionDenied: boolean;
}

/**
 * Fallback to Server-side Geolocation (via Vercel IP headers or server lookup)
 * when hardware GPS / browser permission is blocked on Windows laptops.
 */
async function tryServerLocationFallback(): Promise<DeviceCoordinates | null> {
  try {
    const res = await getApproximateServerLocation();
    if (res.success && res.latitude && res.longitude) {
      return {
        latitude: res.latitude,
        longitude: res.longitude,
        accuracy: 2500,
        isApproximate: true,
      };
    }
  } catch (e) {
    console.warn('Server location fallback error:', e);
  }
  return null;
}

/**
 * Gets exact device coordinates using hardware GPS and WiFi positioning:
 * - Uses enableHighAccuracy: true with 20s timeout for precise meter-level coordinates
 * - Automatically falls back to Server/Vercel IP Geolocation if Windows/Browser denies permission
 */
export function getPreciseDeviceLocation(): Promise<DeviceCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      tryServerLocationFallback().then((ipLoc) => {
        if (ipLoc) return resolve(ipLoc);
        reject({
          code: 0,
          message: 'Geolocation is not supported by your browser',
          isPermissionDenied: false,
        });
      });
      return;
    }

    let settled = false;

    const handleFinalFailure = async (code: number, defaultMsg: string) => {
      // Smart Server Fallback: Uses Vercel IP geolocation headers
      const ipLoc = await tryServerLocationFallback();
      if (ipLoc) {
        if (settled) return;
        settled = true;
        resolve(ipLoc);
        return;
      }

      if (settled) return;
      settled = true;
      reject({
        code,
        message: defaultMsg,
        isPermissionDenied: code === 1,
      });
    };

    // 1. High Accuracy attempt (Uses WiFi BSSIDs + GPS on mobile/laptops)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err1) => {
        if (err1.code === 1) {
          // Permission denied by browser / Windows OS -> trigger smart server fallback
          handleFinalFailure(
            1,
            'Location access was blocked. Please allow location access in your browser or use "Pin from Map".'
          );
          return;
        }

        console.warn('High-accuracy location attempt failed, trying standard network positioning...', err1);

        // 2. Standard accuracy attempt
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (settled) return;
            settled = true;
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          },
          (err2) => {
            handleFinalFailure(
              err2.code,
              'Could not fetch device coordinates. Please use "Pin from Map" to choose your exact doorstep.'
            );
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}
