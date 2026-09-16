'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle, RefreshCw, X, AlertCircle, Camera, Upload, RotateCcw, Check, CameraOff } from 'lucide-react';
import { submitWalletKyc } from '../actions';
import { showToast } from '@/components/shared/Toast';
import { useCamera } from '@/hooks/useCamera';
import type { Wallet } from '../types';

interface WalletKycModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletStatus: string;
  wallet: Wallet | null;
  onSuccess: () => void;
  defaultName?: string;
  defaultEmail?: string;
}

export default function WalletKycModal({
  isOpen,
  onClose,
  walletStatus,
  wallet,
  onSuccess,
  defaultName = '',
  defaultEmail = '',
}: WalletKycModalProps) {
  const [kycName, setKycName] = useState(defaultName);
  const [kycEmail, setKycEmail] = useState(defaultEmail);
  const [documentType, setDocumentType] = useState('Aadhar Card');
  const [kycPhotoFile, setKycPhotoFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const [kycPhotoMode, setKycPhotoMode] = useState<'upload' | 'camera'>('upload');
  const [capturedPhotoFile, setCapturedPhotoFile] = useState<File | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);

  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [kycError, setKycError] = useState('');

  const { status, error: cameraError, startCamera, stopCamera, capturePhoto, videoRef } = useCamera({
    defaultFacingMode: 'user',
  });

  const handleClose = () => {
    stopCamera();
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
      setCapturedPhotoUrl(null);
    }
    setCapturedPhotoFile(null);
    setKycPhotoMode('upload');
    onClose();
  };

  useEffect(() => {
    return () => {
      stopCamera();
      if (capturedPhotoUrl) {
        URL.revokeObjectURL(capturedPhotoUrl);
      }
    };
  }, [stopCamera, capturedPhotoUrl]);

  if (!isOpen) return null;

  const handleStartCamera = async () => {
    setKycPhotoMode('camera');
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
      setCapturedPhotoUrl(null);
    }
    setCapturedPhotoFile(null);
    await startCamera('user');
  };

  const handleCapture = async () => {
    const file = await capturePhoto(null, 'kyc-selfie');
    if (file) {
      const url = URL.createObjectURL(file);
      setCapturedPhotoFile(file);
      setCapturedPhotoUrl(url);
    }
  };

  const handleRetake = async () => {
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
      setCapturedPhotoUrl(null);
    }
    setCapturedPhotoFile(null);
    await startCamera('user');
  };

  const handleUsePhoto = () => {
    if (capturedPhotoFile) {
      setKycPhotoFile(capturedPhotoFile);
      stopCamera();
      setKycPhotoMode('upload');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycError('');

    if (!kycName.trim() || !kycEmail.trim() || !kycPhotoFile || !documentFile) {
      setKycError('Please fill all fields, capture/upload your live selfie, and upload your ID document.');
      return;
    }

    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
    if (kycPhotoFile.size > MAX_SIZE_BYTES) {
      setKycError('Live Photo / Selfie must be under 5MB in size.');
      return;
    }
    if (documentFile.size > MAX_SIZE_BYTES) {
      setKycError('ID Document must be under 5MB in size.');
      return;
    }

    setSubmittingKyc(true);
    try {
      /* 
      // OLD CODE (File Upload API) - Commented out because Vercel uses an ephemeral file system
      const photoFormData = new FormData();
      photoFormData.append('file', kycPhotoFile);
      photoFormData.append('category', 'kyc');
      const photoRes = await fetch('/api/upload', { method: 'POST', body: photoFormData });
      const photoData = await photoRes.json();
      if (!photoData.success) throw new Error(photoData.error || 'Failed to upload photo');

      const docFormData = new FormData();
      docFormData.append('file', documentFile);
      docFormData.append('category', 'kyc');
      const docRes = await fetch('/api/upload', { method: 'POST', body: docFormData });
      const docData = await docRes.json();
      if (!docData.success) throw new Error(docData.error || 'Failed to upload document');
      */

      const photoBase64 = await fileToBase64(kycPhotoFile);
      const docBase64 = await fileToBase64(documentFile);

      const submitRes = await submitWalletKyc({
        kycName: kycName.trim(),
        kycEmail: kycEmail.trim(),
        documentType,
        kycPhotoUrl: photoBase64,
        panCardUrl: docBase64,
      });

      if (submitRes.success) {
        showToast('KYC Submitted Successfully! Please wait for admin approval.');
        onSuccess();
      } else {
        setKycError(submitRes.error || 'Failed to submit KYC.');
      }
    } catch (err: unknown) {
      setKycError(err instanceof Error ? err.message : 'An unexpected error occurred during KYC upload.');
    } finally {
      setSubmittingKyc(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-zcard border border-zborder rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-z-modal animate-scale-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3.5 border-b border-zborder mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-zred/10 border border-zred/20 flex items-center justify-center text-zred">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h3 className="font-bold text-ztext text-sm sm:text-base">Wallet Activation (KYC)</h3>
              <p className="text-[11px] text-ztext-lighter">Required to unlock wallet features</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-zgray text-ztext-lighter hover:text-ztext transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {walletStatus === 'pending' ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
              <RefreshCw size={32} className="animate-spin" />
            </div>
            <h2 className="text-lg font-black text-ztext mb-2">KYC Under Review</h2>
            <p className="text-sm text-ztext-light">
              Your wallet activation request is currently pending. Our team is reviewing your documents. Please check back later.
            </p>
            <button
              onClick={handleClose}
              className="mt-6 px-6 py-2 bg-zgray border border-zborder rounded-xl text-sm font-semibold hover:bg-zcard transition-colors"
            >
              Got it
            </button>
          </div>
        ) : (
          <form onSubmit={handleKycSubmit} className="space-y-4">
            {walletStatus === 'rejected' && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3 text-red-400">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-xs">Your previous KYC was rejected</p>
                  <p className="text-[10px] mt-0.5">{wallet?.kyc_rejection_reason || 'Invalid documents provided.'}</p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-ztext-lighter mb-1.5">
                Full Name (As per Document)
              </label>
              <input
                type="text"
                value={kycName}
                onChange={(e) => setKycName(e.target.value)}
                className="input-z w-full text-sm"
                placeholder="e.g. Rahul Kumar"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ztext-lighter mb-1.5">Email Address</label>
              <input
                type="email"
                value={kycEmail}
                onChange={(e) => setKycEmail(e.target.value)}
                className="input-z w-full text-sm"
                placeholder="e.g. rahul@example.com"
                required
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-[11px] font-semibold text-ztext-lighter mb-1.5">
                <span>Live Photo / Selfie (Image)</span>
                <span className="text-ztext-muted">Max 5MB</span>
              </label>

              {/* Two Option Mode Switcher */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={handleStartCamera}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                    kycPhotoMode === 'camera'
                      ? 'bg-zred text-white border-zred shadow-sm'
                      : 'bg-zgray/70 text-ztext-light border-zborder hover:border-ztext-lighter hover:text-ztext'
                  }`}
                >
                  <Camera size={14} /> Take Live Photo
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setKycPhotoMode('upload');
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                    kycPhotoMode === 'upload'
                      ? 'bg-ztext text-zbg border-ztext shadow-sm'
                      : 'bg-zgray/70 text-ztext-light border-zborder hover:border-ztext-lighter hover:text-ztext'
                  }`}
                >
                  <Upload size={14} /> Upload Document
                </button>
              </div>

              {/* Camera mode stream & preview */}
              {kycPhotoMode === 'camera' && (
                <div className="rounded-xl border border-zborder overflow-hidden bg-black p-2 text-center">
                  {capturedPhotoUrl ? (
                    <div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={capturedPhotoUrl}
                        alt="Captured selfie preview"
                        className="w-full max-h-56 object-contain rounded-lg border border-zborder mb-2"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleRetake}
                          className="flex-1 button-z button-z-outline py-2 text-xs flex items-center justify-center gap-1.5"
                        >
                          <RotateCcw size={14} /> Retake
                        </button>
                        <button
                          type="button"
                          onClick={handleUsePhoto}
                          className="flex-1 button-z button-z-primary py-2 text-xs flex items-center justify-center gap-1.5"
                        >
                          <Check size={14} /> Use Photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-zinc-900 flex items-center justify-center mb-2">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                        {status === 'starting' && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 text-white text-xs">
                            <RefreshCw size={18} className="animate-spin" /> Starting camera...
                          </div>
                        )}
                        {status === 'error' && (
                          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-3 text-center text-white gap-2">
                            <CameraOff size={24} className="text-red-400" />
                            <p className="text-xs font-semibold text-red-300">Camera Unavailable</p>
                            <p className="text-[11px] text-zinc-300 leading-tight max-w-xs">{cameraError}</p>
                            <button
                              type="button"
                              onClick={handleStartCamera}
                              className="mt-1 px-3 py-1 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-semibold text-white"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </div>

                      {status === 'running' && (
                        <button
                          type="button"
                          onClick={handleCapture}
                          className="w-full py-2.5 bg-zred hover:bg-zred-dark text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Camera size={15} /> Capture Photo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Upload mode file input */}
              {kycPhotoMode === 'upload' && (
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setKycPhotoFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-ztext-light file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-zred/10 file:text-zred hover:file:bg-zred/20 cursor-pointer border border-zborder rounded-xl p-1.5 bg-zgray/50"
                  />
                </div>
              )}

              {/* Selected Photo Status Indicator */}
              {kycPhotoFile && (
                <p className="text-[11px] text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                  <CheckCircle size={13} /> Selected Photo: {kycPhotoFile.name} ({(kycPhotoFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ztext-lighter mb-1.5">Document Type</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="input-z w-full text-sm appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
              >
                <option value="Aadhar Card">Aadhar Card</option>
                <option value="PAN Card">PAN Card</option>
                <option value="Voter ID Card">Voter ID Card</option>
              </select>
            </div>

            <div>
              <label className="flex items-center justify-between text-[11px] font-semibold text-ztext-lighter mb-1.5">
                <span>{documentType} Document (Image)</span>
                <span className="text-ztext-muted">Max 5MB</span>
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-ztext-light file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-zgray file:text-ztext hover:file:bg-zborder cursor-pointer border border-zborder rounded-xl p-1.5 bg-zgray/50"
                required
              />
            </div>

            {kycError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{kycError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submittingKyc}
              className="w-full mt-2 py-3 bg-zred text-white rounded-xl text-sm font-bold hover:bg-zred-dark transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submittingKyc ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {submittingKyc ? 'Uploading & Submitting...' : 'Submit KYC'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
