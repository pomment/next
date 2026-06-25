export interface MatchResult {
  params: Record<string, string>;
}

export function matchPath(pattern: string, pathname: string): MatchResult | null {
  const patternParts = trimSlashes(pattern).split('/');
  const pathParts = trimSlashes(pathname).split('/');

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      continue;
    }

    if (patternPart !== pathPart) {
      return null;
    }
  }

  return { params };
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}
