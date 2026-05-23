import { describe, it, expect } from 'vitest'
import { normalizeSlug, isValidSlug } from '../../src/core/slug'

describe('slug', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['  Trim me  ', 'trim-me'],
    ['Café & Crème', 'cafe-creme'],
    ['multi---dash', 'multi-dash'],
    ['UPPER_under', 'upper-under'],
  ])('normalizeSlug(%s) === %s', (input, expected) => {
    expect(normalizeSlug(input)).toBe(expected)
  })

  it('isValidSlug rejects uppercase, spaces, leading/trailing dashes', () => {
    expect(isValidSlug('valid-slug-1')).toBe(true)
    expect(isValidSlug('Has Space')).toBe(false)
    expect(isValidSlug('-leading')).toBe(false)
    expect(isValidSlug('trailing-')).toBe(false)
    expect(isValidSlug('UPPER')).toBe(false)
    expect(isValidSlug('')).toBe(false)
  })
})
