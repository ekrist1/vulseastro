import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema.js'

export type VulseDb = ReturnType<typeof createDb>

export function createDb(binding: D1Database) {
  if (!binding) throw new Error('Vulse: D1 binding "DB" is missing. Add it to wrangler.toml.')
  return drizzle(binding, { schema })
}

export * as schema from './schema.js'
