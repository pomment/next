import type { AdminIdentity } from '../types';

const IDENTITY_KEY = 'pomment-admin-identity';

export function readIdentity(): AdminIdentity {
  try {
    return JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? '') as AdminIdentity;
  } catch {
    return { name: '', email: '' };
  }
}

export function writeIdentity(identity: AdminIdentity): void {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}
