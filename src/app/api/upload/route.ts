import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { createAdminClient } from '@/infrastructure/supabase/admin';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif', '.jfif', '.bmp', '.ico']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.ogg', '.mkv']);

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.jfif': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg',
  '.mkv': 'video/x-matroska',
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const BUMPER_BUCKET = 'bumper-offers';
const PRODUCT_BUCKET = 'product-images';

function detectCategoryAndMime(fileName: string, mimeType?: string): { category: 'image' | 'video' | null; mime: string } {
  const ext = (path.extname(fileName) || '').toLowerCase();
  const normalizedMime = (mimeType || '').toLowerCase().trim();

  // Check MIME first
  if (normalizedMime.startsWith('image/')) {
    return { category: 'image', mime: normalizedMime };
  }
  if (normalizedMime.startsWith('video/')) {
    return { category: 'video', mime: normalizedMime };
  }

  // Fallback to extension check
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { category: 'image', mime: EXTENSION_MIME_MAP[ext] || 'image/jpeg' };
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return { category: 'video', mime: EXTENSION_MIME_MAP[ext] || 'video/mp4' };
  }

  return { category: null, mime: 'application/octet-stream' };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = (formData.get('category') as string | null) || 'bumper'; // 'bumper' | 'product' | 'kyc'

    if (!file || typeof file === 'string' || file.size === 0) {
      return NextResponse.json({ success: false, error: 'No file uploaded or file is empty' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File size exceeds maximum limit of 50MB' }, { status: 400 });
    }

    const { category: fileCategory, mime: contentType } = detectCategoryAndMime(file.name, file.type);
    if (!fileCategory) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported file format. Please upload an image (JPG, PNG, WEBP, GIF, SVG, AVIF) or video (MP4, WebM, MOV).',
        },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const originalExt = path.extname(file.name).toLowerCase() || (fileCategory === 'video' ? '.mp4' : '.jpg');
    const cleanBaseName = path.basename(file.name, originalExt).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40) || 'media';
    const prefix = category.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileName = `${prefix}-${cleanBaseName}-${Date.now()}${originalExt}`;

    let publicUrl: string | null = null;
    let localSaveSucceeded = false;

    // 1. Primary persistence: Supabase Storage (reliable across Vercel / serverless deployments)
    try {
      const admin = createAdminClient();
      const targetBucket = category === 'bumper' ? BUMPER_BUCKET : PRODUCT_BUCKET;

      let uploadRes = await admin.storage.from(targetBucket).upload(fileName, buffer, {
        contentType,
        cacheControl: '31536000',
        upsert: true,
      });

      // If bucket doesn't exist, try auto-creating bucket or fallback to product bucket
      if (uploadRes.error && (uploadRes.error.message.includes('Bucket not found') || (uploadRes.error as { statusCode?: string }).statusCode === '404')) {
        try {
          await admin.storage.createBucket(targetBucket, { public: true });
          uploadRes = await admin.storage.from(targetBucket).upload(fileName, buffer, {
            contentType,
            cacheControl: '31536000',
            upsert: true,
          });
        } catch {
          // If creating bucket failed, try fallback bucket
          if (targetBucket !== PRODUCT_BUCKET) {
            uploadRes = await admin.storage.from(PRODUCT_BUCKET).upload(fileName, buffer, {
              contentType,
              cacheControl: '31536000',
              upsert: true,
            });
          }
        }
      }

      if (!uploadRes.error) {
        const bucketUsed = (uploadRes.data?.path && targetBucket !== PRODUCT_BUCKET && !uploadRes.error) ? targetBucket : PRODUCT_BUCKET;
        const { data: urlData } = admin.storage.from(bucketUsed).getPublicUrl(fileName);
        if (urlData?.publicUrl) {
          publicUrl = urlData.publicUrl;
        }
      } else {
        console.warn('Supabase storage upload error:', uploadRes.error.message);
      }
    } catch (storageErr) {
      console.warn('Supabase storage unavailable, proceeding with local filesystem:', storageErr);
    }

    // 2. Local filesystem storage (public/uploads)
    try {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      await mkdir(uploadsDir, { recursive: true });
      const filePath = path.join(uploadsDir, fileName);
      await writeFile(filePath, buffer);
      localSaveSucceeded = true;
    } catch (fsErr) {
      console.warn('Local filesystem write failed (likely serverless read-only disk):', fsErr);
    }

    // If local write succeeded and we don't have a remote Supabase URL, use local relative path
    const localPath = `/uploads/${fileName}`;
    const finalUrl = publicUrl || (localSaveSucceeded ? localPath : null);

    if (!finalUrl) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to save file to both cloud storage and local filesystem. Please verify storage permissions or try again.',
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      url: finalUrl,
      fileName,
      type: fileCategory,
      size: file.size,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload file',
      },
      { status: 500 },
    );
  }
}
