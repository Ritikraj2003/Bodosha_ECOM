import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Pre-compute upload directory paths at module load
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const FALLBACK_UPLOADS_DIR = path.join(process.cwd(), 'uploads');

const MIME_TYPES: Record<string, string> = {
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

export async function GET(
  _request: Request,
  props: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments = [] } = await props.params;

    if (!pathSegments.length) {
      return new NextResponse('Bad Request', { status: 400 });
    }

    // Sanitize to file basename to enforce safety against path traversal
    const fileName = path.basename(pathSegments.join('/'));
    const ext = path.extname(fileName).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Direct single I/O read
    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(path.join(UPLOADS_DIR, fileName));
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENOENT') {
        try {
          fileBuffer = await readFile(path.join(FALLBACK_UPLOADS_DIR, fileName));
        } catch {
          return new NextResponse('File not found', { status: 404 });
        }
      } else {
        throw err;
      }
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.error('Error serving upload file:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
