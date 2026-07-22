import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { applyMigrations } from '../helpers/apply-migrations'
import * as schema from '../../src/core/schema'

// Guards the invariant that `src/core/schema.ts` (what the runtime queries
// through) and `migrations/*.sql` (what actually shapes the database) agree.
// Migrations are hand-written, so nothing else checks this.

interface PragmaColumn {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface PragmaIndex {
  name: string
  unique: number
  origin: string // 'c' = CREATE INDEX, 'u' = UNIQUE constraint, 'pk' = primary key
}

interface PragmaForeignKey {
  table: string
  from: string
  to: string
  on_delete: string
}

const tables = Object.values(schema)
  .filter((v) => typeof v === 'object' && v !== null)
  .map((t) => {
    try {
      return getTableConfig(t as Parameters<typeof getTableConfig>[0])
    } catch {
      return null
    }
  })
  .filter((t) => t !== null)

describe('schema drift (migrations/*.sql vs src/core/schema.ts)', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB)
  })

  it('exports at least the known table count from schema.ts', () => {
    expect(tables.length).toBeGreaterThanOrEqual(20)
  })

  it('creates exactly the tables schema.ts declares (no missing, no extra)', async () => {
    const rows = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '\\_%' ESCAPE '\\'
         AND name NOT LIKE 'd1\\_%' ESCAPE '\\'
         AND name NOT LIKE 'vulse_entries_fts%'`,
    ).all<{ name: string }>()
    const dbTables = rows.results.map((r) => r.name).sort()
    const schemaTables = tables.map((t) => t.name).sort()
    expect(dbTables).toEqual(schemaTables)
  })

  for (const table of tables) {
    describe(table.name, () => {
      it('columns match', async () => {
        const rows = await env.DB.prepare(`PRAGMA table_info(${quote(table.name)})`).all<PragmaColumn>()
        const dbCols = new Map(rows.results.map((c) => [c.name, c]))

        expect([...dbCols.keys()].sort()).toEqual(table.columns.map((c) => c.name).sort())

        for (const col of table.columns) {
          const dbCol = dbCols.get(col.name)!
          expect(dbCol.type.toLowerCase(), `${table.name}.${col.name} type`).toBe(col.getSQLType().toLowerCase())

          // SQLite quirk: PRIMARY KEY does not imply NOT NULL (except rowid
          // aliases), so compare the effective nullability on both sides.
          const dbNotNull = dbCol.notnull === 1 || dbCol.pk > 0
          const schemaNotNull = col.notNull || col.primary
          expect(dbNotNull, `${table.name}.${col.name} NOT NULL`).toBe(schemaNotNull)

          const dbHasDefault = dbCol.dflt_value !== null
          expect(dbHasDefault, `${table.name}.${col.name} DEFAULT`).toBe(col.hasDefault)
        }
      })

      it('primary key matches', async () => {
        const rows = await env.DB.prepare(`PRAGMA table_info(${quote(table.name)})`).all<PragmaColumn>()
        const dbPk = rows.results.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name)

        const schemaPk = table.columns.filter((c) => c.primary).map((c) => c.name)
        for (const pk of table.primaryKeys) schemaPk.push(...pk.columns.map((c) => c.name))
        expect(dbPk).toEqual(schemaPk)
      })

      it('indexes match', async () => {
        const rows = await env.DB.prepare(`PRAGMA index_list(${quote(table.name)})`).all<PragmaIndex>()
        // origin 'c' covers CREATE INDEX / CREATE UNIQUE INDEX; 'u'/'pk' are
        // inline constraints already covered by the column checks above.
        const dbIndexes = rows.results
          .filter((i) => i.origin === 'c')
          .map((i) => `${i.name}${i.unique ? ' (unique)' : ''}`)
          .sort()

        const schemaIndexes = table.indexes.map((i) => `${i.config.name}${i.config.unique ? ' (unique)' : ''}`)
        // Column-level .unique() is emitted by the migrations as a named
        // unique index following drizzle-kit's `<table>_<column>_unique` convention.
        for (const col of table.columns) {
          if (col.isUnique) schemaIndexes.push(`${col.uniqueName ?? `${table.name}_${col.name}_unique`} (unique)`)
        }
        expect(dbIndexes).toEqual(schemaIndexes.sort())
      })

      it('foreign keys match', async () => {
        const rows = await env.DB.prepare(`PRAGMA foreign_key_list(${quote(table.name)})`).all<PragmaForeignKey>()
        const dbFks = rows.results
          .map((fk) => `${fk.from} -> ${fk.table}.${fk.to} on delete ${fk.on_delete.toLowerCase()}`)
          .sort()

        const schemaFks = table.foreignKeys
          .map((fk) => {
            const ref = fk.reference()
            const from = ref.columns.map((c) => c.name).join(',')
            const to = ref.foreignColumns.map((c) => c.name).join(',')
            const foreignTable = getTableConfig(ref.foreignTable).name
            return `${from} -> ${foreignTable}.${to} on delete ${fk.onDelete ?? 'no action'}`
          })
          .sort()
        expect(dbFks).toEqual(schemaFks)
      })
    })
  }
})

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}
