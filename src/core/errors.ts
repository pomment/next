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
