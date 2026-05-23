import { describe, it, expect } from 'vitest'
import { VulseError, ValidationError, NotFoundError, AccessDeniedError, ConflictError } from '../../src/core/errors'

describe('VulseError', () => {
  it('exposes a stable code and HTTP status', () => {
    const e = new ValidationError('bad', { field: 'title' })
    expect(e.code).toBe('VALIDATION')
    expect(e.status).toBe(422)
    expect(e.details).toEqual({ field: 'title' })
  })

  it('NotFoundError is 404', () => {
    expect(new NotFoundError('nope').status).toBe(404)
  })

  it('AccessDeniedError is 403', () => {
    expect(new AccessDeniedError('no').status).toBe(403)
  })

  it('ConflictError is 409', () => {
    expect(new ConflictError('dup').status).toBe(409)
  })

  it('VulseError.isVulseError narrows unknown', () => {
    const e: unknown = new ValidationError('bad')
    expect(VulseError.isVulseError(e)).toBe(true)
    expect(VulseError.isVulseError(new Error('plain'))).toBe(false)
  })
})
