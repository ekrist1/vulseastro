import { describe, expect, it } from 'vitest'
import { z } from 'astro/zod'

import { parseContent } from '../../src/core/parse-content.js'
import { ValidationError } from '../../src/core/errors.js'

const schema = z.object({
  title: z.string().min(1),
  cover: z.string().describe('vulse:media'),
  count: z.number().min(2).optional(),
})

describe('parseContent', () => {
  it('returns parsed value on success', () => {
    expect(parseContent(schema, { title: 'Hi', cover: 'media-1' })).toEqual({
      title: 'Hi',
      cover: 'media-1',
    })
  })

  it('humanizes missing-required as "This field is required."', () => {
    let caught: ValidationError | null = null
    try {
      parseContent(schema, { title: 'Hi' })
    } catch (e) {
      caught = e as ValidationError
    }
    expect(caught).toBeInstanceOf(ValidationError)
    const issues = (caught!.details as { issues: { path: (string | number)[]; message: string }[] }).issues
    const cover = issues.find((i) => i.path[0] === 'cover')
    expect(cover?.message).toBe('This field is required.')
  })

  it('summarizes the first issue at the top level', () => {
    expect(() => parseContent(schema, { title: '', cover: 'x' }))
      .toThrowError(/title/)
  })

  it('emits multiple issues with humanized messages', () => {
    let caught: ValidationError | null = null
    try {
      parseContent(schema, { title: '', count: 1 })
    } catch (e) {
      caught = e as ValidationError
    }
    const issues = (caught!.details as { issues: { path: (string | number)[]; message: string }[] }).issues
    expect(issues.length).toBeGreaterThanOrEqual(2)
    expect(issues.find((i) => i.path[0] === 'cover')?.message).toBe('This field is required.')
  })
})
