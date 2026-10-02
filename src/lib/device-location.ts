export interface DeviceCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface LocationError {
  code: number;
  message: string;
  isPermissionDenied: boolean;
}

/**
 * Gets exact device coordinates using hardware GPS and WiFi positioning:
 * - Uses enableHighAccuracy: true with 20s timeout for precise meter-level coordinates
 * - Falls back to standard network triangulation if GPS hardware is not present
 */
export function getPreciseDeviceLocation(): Promise<DeviceCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return reject({
        code: 0,
        message: 'Geolocation is not supported by your browser',
        isPermissionDenied: false,
      });
    }

    let settled = false;

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
          if (settled) return;
          settled = true;
          return reject({
            code: 1,
            message: 'Location access was blocked. Please allow location access in your browser or use "Pin from Map".',
            isPermissionDenied: true,
          });
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
            if (settled) return;
            settled = true;
            reject({
              code: err2.code,
              message: 'Could not fetch device coordinates. Please use "Pin from Map" to choose your exact doorstep.',
              isPermissionDenied: err2.code === 1,
            });
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}
