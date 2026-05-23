import { createHash } from 'node:crypto'
import type { VulseDb } from '../db.js'
import { vulseFormUniqueValues } from '../schema.js'
import { ConflictError } from '../errors.js'

export function normalizeUniqueValue(value: unknown): string {
  return String(value).trim().toLowerCase()
}

export function hashUniqueValue(value: unknown): string {
  return createHash('sha256').update(normalizeUniqueValue(value)).digest('hex')
}

export async function insertUniqueValues(
  db: VulseDb,
  formHandle: string,
  submissionId: string,
  fields: Record<string, unknown>,
  uniqueFieldNames: string[],
): Promise<void> {
  const now = new Date()
  for (const name of uniqueFieldNames) {
    const value = fields[name]
    if (value === undefined || value === null || value === '') continue
    const valueHash = hashUniqueValue(value)
    try {
      await db.insert(vulseFormUniqueValues).values({
        formHandle,
        fieldName: name,
        valueHash,
        submissionId,
        createdAt: now,
      })
    } catch {
      throw new ConflictError(`Duplicate value for field "${name}"`, { field: name })
    }
  }
}
