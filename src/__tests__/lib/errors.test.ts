import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from '@/lib/errors';

describe('AppError', () => {
  it('creates error with message and defaults', () => {
    const err = new AppError('Something went wrong');
    expect(err.message).toBe('Something went wrong');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.name).toBe('AppError');
  });

  it('creates error with custom status and code', () => {
    const err = new AppError('Custom', 418, 'CUSTOM_ERROR');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('CUSTOM_ERROR');
  });
});

describe('ValidationError', () => {
  it('has 400 status and VALIDATION_ERROR code', () => {
    const err = new ValidationError('Invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Invalid input');
    expect(err.name).toBe('ValidationError');
  });
});

describe('AuthenticationError', () => {
  it('has 401 status with default message', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_ERROR');
    expect(err.message).toBe('Authentication required');
  });

  it('accepts custom message', () => {
    const err = new AuthenticationError('Please log in again');
    expect(err.message).toBe('Please log in again');
  });
});

describe('AuthorizationError', () => {
  it('has 403 status with default message', () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('AUTHORIZATION_ERROR');
    expect(err.message).toBe('Insufficient permissions');
  });
});

describe('NotFoundError', () => {
  it('has 404 status and formats message', () => {
    const err = new NotFoundError('User');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('User not found');
  });

  it('uses default resource name', () => {
    const err = new NotFoundError();
    expect(err.message).toBe('Resource not found');
  });
});

describe('ConflictError', () => {
  it('has 409 status', () => {
    const err = new ConflictError('Duplicate entry');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

describe('RateLimitError', () => {
  it('has 429 status with default message', () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.message).toBe('Too many requests. Please try again later.');
  });
});

describe('Error hierarchy', () => {
  it('all custom errors are instances of AppError', () => {
    expect(new ValidationError('x')).toBeInstanceOf(AppError);
    expect(new AuthenticationError()).toBeInstanceOf(AppError);
    expect(new AuthorizationError()).toBeInstanceOf(AppError);
    expect(new NotFoundError()).toBeInstanceOf(AppError);
    expect(new ConflictError('x')).toBeInstanceOf(AppError);
    expect(new RateLimitError()).toBeInstanceOf(AppError);
  });

  it('all custom errors are instances of Error', () => {
    expect(new ValidationError('x')).toBeInstanceOf(Error);
    expect(new RateLimitError()).toBeInstanceOf(Error);
  });
});
