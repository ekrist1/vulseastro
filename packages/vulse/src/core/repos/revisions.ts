import { and, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { VulseDb } from '../db.js'
import { entryRevisions } from '../schema.js'
import { NotFoundError } from '../errors.js'
import { EntriesRepo } from './entries.js'

export interface RevisionRow {
  id: string; entryId: string; version: number; content: unknown;
  authorId: string | null; changeSummary: string | null; createdAt: Date;
}

export class RevisionsRepo {
  constructor(private db: VulseDb) {}

  async listByEntry(entryId: string): Promise<RevisionRow[]> {
    return await this.db.select().from(entryRevisions)
      .where(eq(entryRevisions.entryId, entryId))
      .orderBy(desc(entryRevisions.version)) as RevisionRow[]
  }

  async getVersion(entryId: string, version: number): Promise<RevisionRow | null> {
    const [row] = await this.db.select().from(entryRevisions)
      .where(and(eq(entryRevisions.entryId, entryId), eq(entryRevisions.version, version)))
    return (row as RevisionRow | undefined) ?? null
  }

  async restore(entryId: string, version: number, opts: { userId: string }): Promise<void> {
    const target = await this.getVersion(entryId, version)
    if (!target) throw new NotFoundError(`Revision ${version} for ${entryId} not found`)
    const repo = new EntriesRepo(this.db)
    await repo.updateWithRevision(entryId, {
      content: target.content, updatedBy: opts.userId,
      changeSummary: `Restored v${version}`,
    })
  }
}
