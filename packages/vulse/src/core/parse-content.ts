import type { z } from 'astro/zod'
import { ValidationError } from './errors.js'

export function parseContent<S extends z.ZodTypeAny>(schema: S, content: unknown): z.infer<S> {
  const parsed = schema.safeParse(content)
  if (!parsed.success) {
    throw new ValidationError('Content validation failed', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    })
  }
  return parsed.data
}
