import type { z } from 'astro/zod'
import { ValidationError } from './errors.js'

export interface ContentValidationIssue {
  path: (string | number)[]
  message: string
  code?: string
}

/**
 * Parses arbitrary content against a Zod schema. On failure, throws a
 * ValidationError whose message names the first offending field (so the
 * top-level error banner reads sensibly) and whose `details.issues` carries
 * the full list with humanized messages for inline field display.
 */
export function parseContent<S extends z.ZodTypeAny>(schema: S, content: unknown): z.infer<S> {
  const parsed = schema.safeParse(content)
  if (parsed.success) return parsed.data

  const issues: ContentValidationIssue[] = parsed.error.issues.map((issue) => ({
    path: issue.path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number'),
    message: humanizeIssue(issue),
    code: issue.code,
  }))

  throw new ValidationError(summarize(issues), { issues })
}

function summarize(issues: ContentValidationIssue[]): string {
  if (issues.length === 0) return 'Validation failed'
  const first = issues[0]!
  const fieldLabel = first.path.length ? first.path.join('.') : 'Content'
  if (issues.length === 1) return `${fieldLabel}: ${first.message}`
  return `${fieldLabel}: ${first.message} (and ${issues.length - 1} more issue${issues.length - 1 === 1 ? '' : 's'})`
}

interface ZodIssueLike {
  code: string
  message: string
  path: (string | number | symbol)[]
  // Zod 4 fields
  expected?: string
  origin?: string
  minimum?: number | bigint
  maximum?: number | bigint
  inclusive?: boolean
  format?: string
  // Zod 3 fields (kept for compatibility)
  received?: string
  type?: string
  validation?: string
}

function humanizeIssue(issue: unknown): string {
  const i = issue as ZodIssueLike

  // Missing required value.
  if (i.code === 'invalid_type') {
    if (i.received === 'undefined' || i.received === 'null') return 'This field is required.'
    if (/received (undefined|null)/.test(i.message)) return 'This field is required.'
    if (i.expected) return `Expected ${i.expected}.`
  }

  // Length / numeric bounds.
  const origin = i.origin ?? i.type
  if (i.code === 'too_small') {
    if (origin === 'string' && Number(i.minimum) === 1) return 'This field is required.'
    if (origin === 'string') return `Must be at least ${i.minimum} characters.`
    if (origin === 'number') return `Must be ${i.inclusive ? 'at least' : 'greater than'} ${i.minimum}.`
    if (origin === 'array') return `Add at least ${i.minimum} item${i.minimum === 1 ? '' : 's'}.`
  }
  if (i.code === 'too_big') {
    if (origin === 'string') return `Must be at most ${i.maximum} characters.`
    if (origin === 'number') return `Must be ${i.inclusive ? 'at most' : 'less than'} ${i.maximum}.`
    if (origin === 'array') return `No more than ${i.maximum} item${i.maximum === 1 ? '' : 's'}.`
  }

  // String formats (Zod 4: invalid_format with format; Zod 3: invalid_string with validation).
  const fmt = i.format ?? i.validation
  if (fmt === 'email') return 'Enter a valid email address.'
  if (fmt === 'url') return 'Enter a valid URL.'

  if (i.message === 'Required') return 'This field is required.'
  return i.message
}
