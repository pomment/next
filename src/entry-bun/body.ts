import { PayloadTooLargeError, ValidationError } from '../core/errors';

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ValidationError('invalid json body');
  }
}

export async function readJsonLimited<T>(request: Request, maxBytes: number): Promise<T> {
  const bytes = await readBytesLimited(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new ValidationError('invalid json body');
  }
}

export async function readBytesLimited(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PayloadTooLargeError();
  }

  if (!request.body) {
    throw new ValidationError('invalid json body');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}
