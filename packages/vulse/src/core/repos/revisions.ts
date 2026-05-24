import { and, desc, eq } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { entryRevisions } from '../schema.js'
import { NotFoundError } from '../errors.js'
import { DEFAULT_LOCALE, EntriesRepo } from './entries.js'

export interface RevisionRow {
  id: string
  entryId: string
  locale: string
  version: number
  content: unknown
  authorId: string | null
  changeSummary: string | null
  createdAt: Date
}

export class RevisionsRepo {
  constructor(private db: VulseDb) {}

  async listByEntry(entryId: string, locale: string = DEFAULT_LOCALE): Promise<RevisionRow[]> {
    return await this.db.select().from(entryRevisions)
      .where(and(eq(entryRevisions.entryId, entryId), eq(entryRevisions.locale, locale)))
      .orderBy(desc(entryRevisions.version)) as RevisionRow[]
  }

  async getVersion(entryId: string, version: number, locale: string = DEFAULT_LOCALE): Promise<RevisionRow | null> {
    const [row] = await this.db.select().from(entryRevisions)
      .where(and(
        eq(entryRevisions.entryId, entryId),
        eq(entryRevisions.locale, locale),
        eq(entryRevisions.version, version),
      ))
    return (row as RevisionRow | undefined) ?? null
  }

  async restore(entryId: string, version: number, opts: { userId: string; locale?: string }): Promise<void> {
    const locale = opts.locale ?? DEFAULT_LOCALE
    const target = await this.getVersion(entryId, version, locale)
    if (!target) throw new NotFoundError(`Revision ${version} for ${entryId} (${locale}) not found`)
    const repo = new EntriesRepo(this.db)
    await repo.updateWithRevision(entryId, {
      locale,
      content: target.content,
      updatedBy: opts.userId,
      changeSummary: `Restored v${version}`,
    })
  }

  /** Keep only the most recent `keep` revisions per (entry, locale). */
  async prune(entryId: string, locale: string, keep: number): Promise<number> {
    if (keep < 1) return 0
    const all = await this.listByEntry(entryId, locale)
    const toDelete = all.slice(keep)
    for (const r of toDelete) {
      await this.db.delete(entryRevisions).where(eq(entryRevisions.id, r.id))
    }
    return toDelete.length
  }
}
