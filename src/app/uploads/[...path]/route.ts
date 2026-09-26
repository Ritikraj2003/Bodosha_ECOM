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

    // Sanitize path segments to prevent directory traversal
    const safeSubPath = path.normalize(pathSegments.join('/')).replace(/^(\.\.(\/|\\|$))+/, '');
    const resolvedPath = path.resolve(UPLOADS_DIR, safeSubPath);
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);

    // Enforce that the target file resides within UPLOADS_DIR
    if (!resolvedPath.startsWith(resolvedUploadsDir)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Direct single I/O read
    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(resolvedPath);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENOENT') {
        try {
          const fallbackPath = path.resolve(FALLBACK_UPLOADS_DIR, safeSubPath);
          fileBuffer = await readFile(fallbackPath);
        } catch {
          // As a secondary fallback, check if it was placed flat in the root of UPLOADS_DIR
          try {
            const flatFallback = path.join(UPLOADS_DIR, path.basename(safeSubPath));
            fileBuffer = await readFile(flatFallback);
          } catch {
            // Or check inside bumper, products, or categories subfolders
            const base = path.basename(safeSubPath);
            let foundBuffer: Buffer | null = null;
            for (const sub of ['bumper', 'products', 'categories']) {
              try {
                foundBuffer = await readFile(path.join(UPLOADS_DIR, sub, base));
                break;
              } catch {}
            }
            if (foundBuffer) {
              fileBuffer = foundBuffer;
            } else {
              return new NextResponse('File not found', { status: 404 });
            }
          }
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
