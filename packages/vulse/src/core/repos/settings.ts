import { eq } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { settings } from '../schema.js'

export class SettingsRepo {
  constructor(private db: VulseDb) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, key))
    return (row?.value as T | undefined) ?? null
  }

  async set(key: string, value: unknown): Promise<void> {
    const now = new Date()
    await this.db.insert(settings).values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
  }

  async all(): Promise<Record<string, unknown>> {
    const rows = await this.db.select().from(settings)
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  }
}
