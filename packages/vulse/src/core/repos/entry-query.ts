import { eq, sql, type SQL } from 'drizzle-orm'
import type { VulseDb } from '../db.js'
import { entries, entryLocales } from '../schema.js'
import { ValidationError } from '../errors.js'
import { joinToEntry, type EntryRow } from './entries.js'

export type Operator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'notIn' | 'like' | 'startsWith' | 'endsWith'
  | 'between' | 'isNull' | 'notNull' | 'contains'

export interface Condition { field: string; op: Operator; value?: unknown }
export interface QueryGroup { combine: 'and' | 'or'; nodes: (Condition | QueryGroup)[] }

export interface EntryQuerySpec {
  collection: string
  locale: string
  where: QueryGroup
  descendants?: { parentId: string; depth?: number; includeSelf?: boolean }
  orderBy?: { field: string; dir: 'asc' | 'desc' }[]
  limit?: number
  offset?: number
}

const COLUMNS = {
  id: entries.id,
  slug: entryLocales.slug,
  status: entryLocales.status,
  parentId: entries.parentId,
  sortOrder: entries.sortOrder,
  createdBy: entries.createdBy,
  publishedAt: entryLocales.publishedAt,
  createdAt: entries.createdAt,
  updatedAt: entryLocales.updatedAt,
} as const

const FIELD_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/

function validateField(field: string): void {
  if (!FIELD_RE.test(field)) throw new ValidationError(`Invalid query field: ${field}`)
  if (!field.startsWith('content.') && !(field in COLUMNS)) {
    throw new ValidationError(`Unknown query field: ${field}`)
  }
}

function jsonPath(field: string): string {
  return '$.' + field.slice('content.'.length)
}

function fieldSql(field: string): SQL {
  if (field.startsWith('content.')) {
    return sql`json_extract(${entryLocales.content}, ${jsonPath(field)})`
  }
  return sql`${COLUMNS[field as keyof typeof COLUMNS]}`
}

function normalize(value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return value.getTime()
  return value
}

function arrayValue(value: unknown, op: Operator): unknown[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`Operator '${op}' requires an array value`)
  }
  return value
}

function betweenValue(value: unknown): [unknown, unknown] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new ValidationError(`Operator 'between' requires a two-item array value`)
  }
  return [value[0], value[1]]
}

function compileCondition(c: Condition): SQL {
  validateField(c.field)
  const f = fieldSql(c.field)
  const v = c.value
  switch (c.op) {
    case 'eq': return sql`${f} = ${normalize(v)}`
    case 'ne': return sql`${f} <> ${normalize(v)}`
    case 'gt': return sql`${f} > ${normalize(v)}`
    case 'gte': return sql`${f} >= ${normalize(v)}`
    case 'lt': return sql`${f} < ${normalize(v)}`
    case 'lte': return sql`${f} <= ${normalize(v)}`
    case 'like': return sql`${f} LIKE ${'%' + String(v) + '%'}`
    case 'startsWith': return sql`${f} LIKE ${String(v) + '%'}`
    case 'endsWith': return sql`${f} LIKE ${'%' + String(v)}`
    case 'isNull': return sql`${f} IS NULL`
    case 'notNull': return sql`${f} IS NOT NULL`
    case 'between': {
      const [lo, hi] = betweenValue(v)
      return sql`${f} BETWEEN ${normalize(lo)} AND ${normalize(hi)}`
    }
    case 'in': {
      const arr = arrayValue(v, c.op)
      if (arr.length === 0) return sql`1 = 0`
      return sql`${f} IN (${sql.join(arr.map((x) => sql`${normalize(x)}`), sql`, `)})`
    }
    case 'notIn': {
      const arr = arrayValue(v, c.op)
      if (arr.length === 0) return sql`1 = 1`
      return sql`${f} NOT IN (${sql.join(arr.map((x) => sql`${normalize(x)}`), sql`, `)})`
    }
    case 'contains': {
      if (!c.field.startsWith('content.')) throw new ValidationError(`'contains' requires a content.* field`)
      return sql`EXISTS (SELECT 1 FROM json_each(${entryLocales.content}, ${jsonPath(c.field)}) WHERE value = ${normalize(v)})`
    }
    default: throw new ValidationError(`Unknown operator: ${(c as Condition).op}`)
  }
}

function validateWindow(spec: EntryQuerySpec): void {
  if (spec.limit !== undefined && (!Number.isInteger(spec.limit) || spec.limit < 0)) {
    throw new ValidationError('Query limit must be a non-negative integer')
  }
  if (spec.offset !== undefined && (!Number.isInteger(spec.offset) || spec.offset < 0)) {
    throw new ValidationError('Query offset must be a non-negative integer')
  }
}

function isGroup(node: Condition | QueryGroup): node is QueryGroup {
  return 'combine' in node
}

function compileGroup(group: QueryGroup): SQL | undefined {
  const parts = group.nodes
    .map((n) => (isGroup(n) ? compileGroup(n) : compileCondition(n)))
    .filter((p): p is SQL => p !== undefined)
  if (parts.length === 0) return undefined
  const joiner = group.combine === 'or' ? sql` OR ` : sql` AND `
  return sql`(${sql.join(parts, joiner)})`
}

function descendantsCondition(d: NonNullable<EntryQuerySpec['descendants']>): SQL {
  if (d.depth !== undefined && d.depth < 1) throw new ValidationError('descendantsOf depth must be >= 1')
  const depthClause = d.depth !== undefined ? sql` WHERE s.depth + 1 <= ${d.depth}` : sql``
  const selfClause = d.includeSelf ? sql`` : sql` WHERE depth > 0`
  return sql`${entries.id} IN (WITH RECURSIVE subtree(id, depth) AS (SELECT id, 0 AS depth FROM ${entries} WHERE id = ${d.parentId} UNION ALL SELECT c.id, s.depth + 1 FROM ${entries} c JOIN subtree s ON c.parent_id = s.id${depthClause}) SELECT id FROM subtree${selfClause})`
}

function buildWhere(spec: EntryQuerySpec): SQL {
  const conds: SQL[] = [
    sql`${entries.collection} = ${spec.collection}`,
    sql`${entryLocales.locale} = ${spec.locale}`,
  ]
  const group = compileGroup(spec.where)
  if (group) conds.push(group)
  if (spec.descendants) conds.push(descendantsCondition(spec.descendants))
  return sql`${sql.join(conds, sql` AND `)}`
}

function buildOrder(spec: EntryQuerySpec): SQL[] {
  if (!spec.orderBy?.length) {
    return [sql`${entries.sortOrder} ASC`, sql`${entryLocales.updatedAt} DESC`]
  }
  return spec.orderBy.map((o) => {
    validateField(o.field)
    const f = fieldSql(o.field)
    return o.dir === 'desc' ? sql`${f} DESC` : sql`${f} ASC`
  })
}

export async function runEntryQuery(db: VulseDb, spec: EntryQuerySpec): Promise<EntryRow[]> {
  validateWindow(spec)
  const base = db.select({ shell: entries, loc: entryLocales })
    .from(entries)
    .innerJoin(entryLocales, eq(entryLocales.entryId, entries.id))
    .where(buildWhere(spec))
    .orderBy(...buildOrder(spec))
  const limited = spec.limit !== undefined ? base.limit(spec.limit) : base
  const paged = spec.offset !== undefined ? limited.offset(spec.offset) : limited
  const rows = await paged
  return rows.map((r) => joinToEntry(r.shell, r.loc))
}

export async function countEntryQuery(db: VulseDb, spec: EntryQuerySpec): Promise<number> {
  validateWindow(spec)
  const [row] = await db.select({ n: sql<number>`count(*)` })
    .from(entries)
    .innerJoin(entryLocales, eq(entryLocales.entryId, entries.id))
    .where(buildWhere(spec))
  return row?.n ?? 0
}
