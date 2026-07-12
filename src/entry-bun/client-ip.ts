import { isIP } from 'node:net';

export function clientIpFromProxy(request: Request, peer: string | null): string | null {
  if (!peer || !isLoopback(peer)) {
    return null;
  }
  for (const name of ['x-real-ip', 'cf-connecting-ip']) {
    const forwarded = request.headers.get(name)?.trim();
    if (forwarded && isIP(forwarded)) {
      return forwarded;
    }
  }
  return null;
}

function isLoopback(address: string): boolean {
  return address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1';
}
