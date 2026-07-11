export class PommentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends PommentError {
  constructor(message = 'not found') {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends PommentError {
  constructor(message = 'bad request') {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class ConflictError extends PommentError {
  constructor(message = 'conflict') {
    super(message, 'CONFLICT', 409);
  }
}

export class UnauthorizedError extends PommentError {
  constructor(message = 'unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends PommentError {
  constructor(message = 'forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class PayloadTooLargeError extends PommentError {
  constructor(message = 'payload too large') {
    super(message, 'PAYLOAD_TOO_LARGE', 413);
  }
}

export class TooManyRequestsError extends PommentError {
  constructor(public readonly retryAfterSeconds: number, message = 'too many requests') {
    super(message, 'TOO_MANY_REQUESTS', 429);
  }
}

export class ServiceUnavailableError extends PommentError {
  constructor(message = 'service unavailable') {
    super(message, 'SERVICE_UNAVAILABLE', 503);
  }
}
