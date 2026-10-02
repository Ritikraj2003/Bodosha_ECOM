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
 * Gets exact device coordinates using real hardware GPS / browser geolocation:
 * - Never assumes or guesses coordinates via IP address.
 * - If permission is denied or device fails, rejects with error so user manually enters coordinates.
 */
export function getPreciseDeviceLocation(): Promise<DeviceCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return reject({
        code: 0,
        message: 'Geolocation is not supported by your browser. Please enter coordinates manually.',
        isPermissionDenied: false,
      });
    }

    let settled = false;

    // 1. High Accuracy attempt (GPS / WiFi)
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
          // Permission denied by user or browser
          if (settled) return;
          settled = true;
          return reject({
            code: 1,
            message: 'Location permission was denied. Please enter Latitude and Longitude manually below.',
            isPermissionDenied: true,
          });
        }

        console.warn('High-accuracy GPS attempt failed, trying standard positioning...', err1);

        // 2. Standard accuracy attempt with shorter timeout
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
              message:
                err2.code === 1
                  ? 'Location permission was denied. Please enter Latitude and Longitude manually below.'
                  : 'Unable to detect device GPS coordinates. Please enter Latitude and Longitude manually below.',
              isPermissionDenied: err2.code === 1,
            });
          },
          {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 0,
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}
