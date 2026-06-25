export function sanitizeWebsite(website: string | undefined): string {
  if (!website) {
    return '';
  }

  const trimmed = website.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return '';
}
