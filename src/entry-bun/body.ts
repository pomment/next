import { ValidationError } from '../core/errors';

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ValidationError('invalid json body');
  }
}
