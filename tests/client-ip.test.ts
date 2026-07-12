import { describe, expect, test } from 'bun:test';
import { clientIpFromProxy } from '../src/entry-bun/client-ip';

describe('trusted proxy client IP', () => {
  test('accepts nginx and Cloudflare Tunnel client headers from loopback', () => {
    const nginx = new Request('http://localhost', { headers: { 'x-real-ip': '192.0.2.10' } });
    const cloudflare = new Request('http://localhost', { headers: { 'cf-connecting-ip': '2001:db8::10' } });

    expect(clientIpFromProxy(nginx, '127.0.0.1')).toBe('192.0.2.10');
    expect(clientIpFromProxy(cloudflare, '::1')).toBe('2001:db8::10');
  });

  test('prefers X-Real-IP when both headers are present', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-real-ip': '192.0.2.10',
        'cf-connecting-ip': '192.0.2.20',
      },
    });

    expect(clientIpFromProxy(request, '127.0.0.1')).toBe('192.0.2.10');
  });

  test('rejects forwarded headers from non-loopback peers and invalid addresses', () => {
    const valid = new Request('http://localhost', { headers: { 'cf-connecting-ip': '192.0.2.10' } });
    const invalid = new Request('http://localhost', { headers: { 'cf-connecting-ip': 'not-an-ip' } });

    expect(clientIpFromProxy(valid, '198.51.100.1')).toBeNull();
    expect(clientIpFromProxy(invalid, '127.0.0.1')).toBeNull();
  });
});
