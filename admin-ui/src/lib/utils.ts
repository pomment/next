import { ApiError } from '../api';

export function formatDate(value: number): string {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value) : '-';
}

export function errorText(error: unknown, fallback = '请求失败'): string {
  if (error instanceof ApiError)
    return error.status === 404 ? '目标不存在或已被删除' : `${fallback}（HTTP ${error.status}）`;
  return error instanceof Error ? error.message : fallback;
}

export function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function positiveInteger(value: string): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
