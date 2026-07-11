const encoder = new TextEncoder();

export function normalizeAdminPassword(password: string): string {
  return password.normalize('NFC');
}

export function adminPasswordByteLength(password: string): number {
  return encoder.encode(normalizeAdminPassword(password)).byteLength;
}
