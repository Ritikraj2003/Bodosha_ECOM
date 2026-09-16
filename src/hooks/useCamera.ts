'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'running' | 'error';

export type CameraErrorType =
  | 'permission-denied'
  | 'no-camera'
  | 'insecure-context'
  | 'camera-in-use'
  | 'unknown'
  | null;

export interface UseCameraOptions {
  defaultFacingMode?: 'user' | 'environment';
}

export function useCamera(options: UseCameraOptions = {}) {
  const { defaultFacingMode = 'user' } = options;

  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string>('');
  const [errorType, setErrorType] = useState<CameraErrorType>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(defaultFacingMode);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stopCamera = useCallback((videoElement?: HTMLVideoElement | null) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      streamRef.current = null;
    }

    const targetVideo = videoElement || videoRef.current;
    if (targetVideo) {
      targetVideo.srcObject = null;
    }

    setStatus('idle');
  }, []);

  const startCamera = useCallback(
    async (preferredFacingMode?: 'user' | 'environment', targetVideoElement?: HTMLVideoElement | null) => {
      // 1. Check secure context (HTTPS or localhost)
      if (typeof window !== 'undefined') {
        const isLocalhost =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname.endsWith('.localhost');
        if (!window.isSecureContext && !isLocalhost) {
          setStatus('error');
          setErrorType('insecure-context');
          setError('Camera access requires a secure connection (HTTPS).');
          return null;
        }
      }

      // 2. Check mediaDevices support
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('error');
        setErrorType('no-camera');
        setError('Camera access is not supported by your browser.');
        return null;
      }

      const modeToUse = preferredFacingMode || facingMode;
      setFacingMode(modeToUse);
      setStatus('starting');
      setError('');
      setErrorType(null);

      // Ensure any existing stream is cleaned up
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      let stream: MediaStream | null = null;

      // 3. Request getUserMedia with fallback constraints
      try {
        // Primary attempt: try with requested facing mode
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: modeToUse,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (primaryError: unknown) {
        // Fallback attempt: if overconstrained or specific mode unavailable, fallback to generic video: true
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch (fallbackError: unknown) {
          const err = (fallbackError || primaryError) as (Error & { name?: string }) | undefined;
          const name = err?.name || '';
          let errType: CameraErrorType = 'unknown';
          let msg = 'Failed to open camera. Please try again.';

          if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
            errType = 'permission-denied';
            msg = 'Camera permission was denied. Please allow camera access in your browser settings and try again.';
          } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            errType = 'no-camera';
            msg = 'No camera device found. Please attach or enable a camera.';
          } else if (name === 'NotReadableError' || name === 'TrackStartError') {
            errType = 'camera-in-use';
            msg = 'Camera is currently in use by another application. Please close other camera apps and retry.';
          } else if (name === 'SecurityError') {
            errType = 'insecure-context';
            msg = 'Camera access is restricted due to security settings.';
          }

          setStatus('error');
          setErrorType(errType);
          setError(msg);
          return null;
        }
      }

      streamRef.current = stream;

      const videoEl = targetVideoElement || videoRef.current;
      if (videoEl && stream) {
         
        videoEl.srcObject = stream;
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('autoplay', 'true');
        videoEl.muted = true;
        try {
          await videoEl.play();
        } catch {
          // Play request might be interrupted or deferred; browser will render frame once ready
        }
      }

      setStatus('running');
      return stream;
    },
    [facingMode]
  );

  const capturePhoto = useCallback(
    async (targetVideoElement?: HTMLVideoElement | null, fileNamePrefix = 'selfie'): Promise<File | null> => {
      const videoEl = targetVideoElement || videoRef.current;
      if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      return new Promise<File | null>((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            const fileName = `${fileNamePrefix}-${Date.now()}.jpg`;
            const file = new File([blob], fileName, { type: 'image/jpeg' });
            resolve(file);
          },
          'image/jpeg',
          0.92
        );
      });
    },
    []
  );

  // Stop camera on component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    status,
    error,
    errorType,
    facingMode,
    streamRef,
    videoRef,
    startCamera,
    stopCamera,
    capturePhoto,
  };
}
