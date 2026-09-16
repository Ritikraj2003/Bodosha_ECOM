import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test.jpg' }, error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/bumper-offers/test.jpg' } })),
      })),
      createBucket: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  })),
}));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from('fake-media-content')),
    },
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from('fake-media-content')),
  };
});

import { POST } from '@/app/api/upload/route';
import { GET as getUploadHandler } from '@/app/uploads/[...path]/route';

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when no file is uploaded', async () => {
    const formData = new FormData();
    const req = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/No file/i);
  });

  it('rejects unsupported file formats', async () => {
    const formData = new FormData();
    const blob = new Blob(['invalid binary data'], { type: 'application/x-executable' });
    formData.append('file', blob, 'malicious.exe');

    const req = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Unsupported file format/i);
  });

  it('successfully uploads an image and returns url', async () => {
    const formData = new FormData();
    const blob = new Blob(['sample image data'], { type: 'image/png' });
    formData.append('file', blob, 'banner.png');
    formData.append('category', 'bumper');

    const req = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.type).toBe('image');
    expect(json.url).toBeTruthy();
  });

  it('successfully uploads a video file', async () => {
    const formData = new FormData();
    const blob = new Blob(['sample video data'], { type: 'video/mp4' });
    formData.append('file', blob, 'promo-video.mp4');
    formData.append('category', 'bumper');

    const req = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.type).toBe('video');
    expect(json.url).toBeTruthy();
  });
});

describe('GET /uploads/[...path]', () => {
  it('serves an uploaded file with correct content-type header', async () => {
    const req = new Request('http://localhost:3000/uploads/bumper-test.png');
    const res = await getUploadHandler(req, {
      params: Promise.resolve({ path: ['bumper-test.png'] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('serves a video with video/mp4 header', async () => {
    const req = new Request('http://localhost:3000/uploads/bumper-promo.mp4');
    const res = await getUploadHandler(req, {
      params: Promise.resolve({ path: ['bumper-promo.mp4'] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
  });
});
