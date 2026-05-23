export type ErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'ACCESS_DENIED' | 'CONFLICT' | 'INTERNAL'

export class VulseError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, status: number, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'VulseError'
    this.code = code
    this.status = status
    if (details !== undefined) {
      this.details = details
    }
  }

  static isVulseError(e: unknown): e is VulseError {
    return e instanceof VulseError
  }
}

export class ValidationError extends VulseError {
  constructor(message: string, details?: Record<string, unknown>) { super('VALIDATION', 422, message, details) }
}
export class NotFoundError extends VulseError {
  constructor(message = 'Not found') { super('NOT_FOUND', 404, message) }
}
export class AccessDeniedError extends VulseError {
  constructor(message = 'Access denied') { super('ACCESS_DENIED', 403, message) }
}
export class ConflictError extends VulseError {
  constructor(message: string, details?: Record<string, unknown>) { super('CONFLICT', 409, message, details) }
}
