import { eq } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { vulseCollections } from '../schema.js'
import { createBlueprint, getBlueprintDefinition } from './mutations.js'
import { blueprintToDefinition } from './code-to-definition.js'
import type { Blueprint } from './types.js'

export async function seedCodeBlueprints(db: VulseDb, codeBlueprints: Blueprint[]): Promise<void> {
  for (const bp of codeBlueprints) {
    const existing = await getBlueprintDefinition(db, bp.name)
    if (existing) continue
    const def = blueprintToDefinition(bp)
    await createBlueprint(db, def)
  }
}

export async function listCollectionHandles(db: VulseDb): Promise<string[]> {
  const rows = await db.select({ handle: vulseCollections.handle }).from(vulseCollections)
  return rows.map((r) => r.handle)
}
