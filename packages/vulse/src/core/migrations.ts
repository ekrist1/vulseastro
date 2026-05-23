import initSql from '../../migrations/0000_init.sql?raw'
import collectionsSetsSql from '../../migrations/0001_collections_sets.sql?raw'
import treeDraftsSql from '../../migrations/0002_tree_drafts.sql?raw'
import ftsSql from '../../migrations/0003_fts.sql?raw'

const MIGRATIONS = [
  { id: '0000_init', sql: initSql },
  { id: '0001_collections_sets', sql: collectionsSetsSql },
  { id: '0002_tree_drafts', sql: treeDraftsSql },
  { id: '0003_fts', sql: ftsSql },
] as const

function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Applies bundled SQL migrations directly to a D1 binding (used in tests and Workers). */
export async function applyMigrations(db: D1Database): Promise<void> {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS _vulse_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
  )

  for (const migration of MIGRATIONS) {
    const applied = await db
      .prepare('SELECT id FROM _vulse_migrations WHERE id = ?')
      .bind(migration.id)
      .first()
    if (applied) continue

    for (const stmt of splitStatements(migration.sql)) {
      await db.exec(stmt.replace(/\s+/g, ' '))
    }

    await db
      .prepare('INSERT INTO _vulse_migrations (id, applied_at) VALUES (?, ?)')
      .bind(migration.id, Date.now())
      .run()
  }
}
