# Content Query Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fluent runtime SDK query builder (`rt.sdk.query(collection)`) for filtered, paginated, relationship-resolving content queries against D1.

**Architecture:** Three layers — a serializable query spec + SQL compiler in `core` (`entry-query.ts`), a fluent `CollectionQuery`/`WhereBuilder` in the server SDK (`sdk/query.ts`), and wiring into `createSdk`. The build-time loader and existing `collections.find()` are untouched.

**Tech Stack:** TypeScript, Drizzle ORM (`drizzle-orm/d1`), SQLite/D1 (`json_extract`, `json_each`, recursive CTEs), Vitest with `@cloudflare/vitest-pool-workers` (`cloudflare:test`).

---

## Reference: existing patterns

- Integration tests run against real D1 via `import { env } from 'cloudflare:test'` and `await applyMigrations(env.DB)` in `beforeEach`. See `tests/integration/entries-repo.test.ts`.
- `createDb(binding)` → Drizzle db; `new EntriesRepo(db)`; `new BlueprintRegistry()`; `defineCollection({...})` from `src/core/blueprints/define`.
- `joinToEntry(shell, loc)` maps a `(entries, entryLocales)` row pair to an `EntryRow`. Currently module-private in `entries.ts` — Task 1 exports it.
- Conditional query chaining mirrors `EntriesRepo.list()` (reassign `base`→`limited`→`paged`), not `$dynamic()`.

---

## Task 1: Export `joinToEntry`, add `findManyByIds`

**Files:**
- Modify: `packages/vulse/src/core/repos/entries.ts`
- Test: `packages/vulse/tests/integration/entries-repo.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('EntriesRepo', ...)` block in `tests/integration/entries-repo.test.ts`:

```ts
  it('findManyByIds returns entries for the given ids at a locale', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const a = await repo.create({ collection: 'post', slug: 'a', content: { title: 'A' }, createdBy: 'u1' })
    const b = await repo.create({ collection: 'post', slug: 'b', content: { title: 'B' }, createdBy: 'u1' })
    await repo.create({ collection: 'post', slug: 'c', content: { title: 'C' }, createdBy: 'u1' })

    const found = await repo.findManyByIds([a.id, b.id])
    expect(found.map((e) => e.slug).sort()).toEqual(['a', 'b'])
    expect(await repo.findManyByIds([])).toEqual([])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/integration/entries-repo.test.ts -t "findManyByIds"`
Expected: FAIL — `repo.findManyByIds is not a function`.

- [ ] **Step 3: Implement**

In `packages/vulse/src/core/repos/entries.ts`, change the `joinToEntry` declaration to export it:

```ts
export function joinToEntry(shell: EntryShell, locale: EntryLocale): EntryRow {
```

Add `inArray` to the existing drizzle import on line 1:

```ts
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
```

Add this method to the `EntriesRepo` class (e.g. after `list`):

```ts
  /** Fetch multiple entries by id at a single locale (used by relationship includes). */
  async findManyByIds(ids: string[], locale: string = DEFAULT_LOCALE): Promise<EntryRow[]> {
    if (ids.length === 0) return []
    const rows = await this.db.select({ shell: entries, loc: entryLocales })
      .from(entries)
      .innerJoin(entryLocales, eq(entryLocales.entryId, entries.id))
      .where(and(inArray(entries.id, ids), eq(entryLocales.locale, locale)))
    return rows.map((r) => joinToEntry(r.shell, r.loc))
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/integration/entries-repo.test.ts -t "findManyByIds"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/core/repos/entries.ts packages/vulse/tests/integration/entries-repo.test.ts
git commit -m "feat(entries): export joinToEntry and add findManyByIds"
```

---

## Task 2: Query spec + compiler (`runEntryQuery`, where/order/pagination)

**Files:**
- Create: `packages/vulse/src/core/repos/entry-query.ts`
- Test: `packages/vulse/tests/integration/entry-query.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/vulse/tests/integration/entry-query.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { runEntryQuery, type EntryQuerySpec } from '../../src/core/repos/entry-query'

function spec(partial: Partial<EntryQuerySpec>): EntryQuerySpec {
  return {
    collection: 'post',
    locale: 'default',
    where: { combine: 'and', nodes: [] },
    ...partial,
  }
}

describe('runEntryQuery', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  async function seed() {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'a', content: { title: 'Alpha', views: 5, featured: true, tags: ['x', 'y'] }, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'post', slug: 'b', content: { title: 'Bravo', views: 50, featured: false, tags: ['y'] }, createdBy: 'u2', status: 'published' })
    await repo.create({ collection: 'post', slug: 'c', content: { title: 'Charlie', views: 500, featured: true, tags: ['z'] }, createdBy: 'u1', status: 'draft' })
    return createDb(env.DB)
  }

  it('filters by a column with eq', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'status', op: 'eq', value: 'published' }] } }))
    expect(rows.map((r) => r.slug).sort()).toEqual(['a', 'b'])
  })

  it('filters by a JSON content path with comparison', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.views', op: 'gte', value: 50 }] } }))
    expect(rows.map((r) => r.slug).sort()).toEqual(['b', 'c'])
  })

  it('filters JSON booleans', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.featured', op: 'eq', value: true }] } }))
    expect(rows.map((r) => r.slug).sort()).toEqual(['a', 'c'])
  })

  it('supports in, like, between, isNull', async () => {
    const db = await seed()
    const inRows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'createdBy', op: 'in', value: ['u2'] }] } }))
    expect(inRows.map((r) => r.slug)).toEqual(['b'])
    const likeRows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.title', op: 'like', value: 'rav' }] } }))
    expect(likeRows.map((r) => r.slug)).toEqual(['b'])
    const betweenRows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.views', op: 'between', value: [10, 100] }] } }))
    expect(betweenRows.map((r) => r.slug)).toEqual(['b'])
  })

  it('supports array contains via json_each', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.tags', op: 'contains', value: 'y' }] } }))
    expect(rows.map((r) => r.slug).sort()).toEqual(['a', 'b'])
  })

  it('composes AND / OR groups', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({
      where: { combine: 'and', nodes: [
        { field: 'status', op: 'eq', value: 'published' },
        { combine: 'or', nodes: [
          { field: 'content.views', op: 'gte', value: 40 },
          { field: 'createdBy', op: 'eq', value: 'u1' },
        ] },
      ] },
    }))
    expect(rows.map((r) => r.slug).sort()).toEqual(['a', 'b'])
  })

  it('orders, limits, and offsets', async () => {
    const db = await seed()
    const rows = await runEntryQuery(db, spec({
      where: { combine: 'and', nodes: [] },
      orderBy: [{ field: 'content.views', dir: 'desc' }],
      limit: 2,
    }))
    expect(rows.map((r) => r.slug)).toEqual(['c', 'b'])
  })

  it('throws on an invalid field path', async () => {
    const db = await seed()
    await expect(runEntryQuery(db, spec({ where: { combine: 'and', nodes: [{ field: 'content.bad path', op: 'eq', value: 1 }] } }))).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/integration/entry-query.test.ts`
Expected: FAIL — cannot resolve `../../src/core/repos/entry-query`.

- [ ] **Step 3: Implement the compiler**

Create `packages/vulse/src/core/repos/entry-query.ts`:

```ts
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
      const [lo, hi] = v as [unknown, unknown]
      return sql`${f} BETWEEN ${normalize(lo)} AND ${normalize(hi)}`
    }
    case 'in': {
      const arr = (v as unknown[]) ?? []
      if (arr.length === 0) return sql`1 = 0`
      return sql`${f} IN (${sql.join(arr.map((x) => sql`${normalize(x)}`), sql`, `)})`
    }
    case 'notIn': {
      const arr = (v as unknown[]) ?? []
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/integration/entry-query.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/core/repos/entry-query.ts packages/vulse/tests/integration/entry-query.test.ts
git commit -m "feat(query): add entry query spec and SQL compiler (where/json/groups/order)"
```

---

## Task 3: Descendant scoping (recursive CTE)

**Files:**
- Modify: `packages/vulse/src/core/repos/entry-query.ts` (already supports `descendants` via `descendantsCondition` from Task 2 — this task adds tests proving it)
- Test: `packages/vulse/tests/integration/entry-query.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/entry-query.test.ts` inside the `describe`:

```ts
  it('scopes to descendants with and without depth', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const root = await repo.create({ collection: 'docs', slug: 'root', content: { t: 'root' }, createdBy: 'u1', status: 'published' })
    const child = await repo.create({ collection: 'docs', slug: 'child', content: { t: 'child' }, createdBy: 'u1', status: 'published', parentId: root.id })
    const grandchild = await repo.create({ collection: 'docs', slug: 'grand', content: { t: 'grand' }, createdBy: 'u1', status: 'published', parentId: child.id })
    const db = createDb(env.DB)

    const all = await runEntryQuery(db, spec({ collection: 'docs', descendants: { parentId: root.id } }))
    expect(all.map((r) => r.slug).sort()).toEqual(['child', 'grand'])

    const directOnly = await runEntryQuery(db, spec({ collection: 'docs', descendants: { parentId: root.id, depth: 1 } }))
    expect(directOnly.map((r) => r.slug)).toEqual(['child'])

    const withSelf = await runEntryQuery(db, spec({ collection: 'docs', descendants: { parentId: root.id, includeSelf: true } }))
    expect(withSelf.map((r) => r.slug).sort()).toEqual(['child', 'grand', 'root'])

    expect(grandchild.id).toBeTruthy()
  })

  it('combines descendants with a where filter', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const root = await repo.create({ collection: 'docs', slug: 'r', content: {}, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'docs', slug: 'pub', content: {}, createdBy: 'u1', status: 'published', parentId: root.id })
    await repo.create({ collection: 'docs', slug: 'drafted', content: {}, createdBy: 'u1', status: 'draft', parentId: root.id })
    const db = createDb(env.DB)

    const rows = await runEntryQuery(db, spec({
      collection: 'docs',
      descendants: { parentId: root.id },
      where: { combine: 'and', nodes: [{ field: 'status', op: 'eq', value: 'published' }] },
    }))
    expect(rows.map((r) => r.slug)).toEqual(['pub'])
  })
```

- [ ] **Step 2: Run test to verify it passes immediately (CTE already implemented in Task 2)**

Run: `pnpm exec vitest run tests/integration/entry-query.test.ts -t "descendants"`
Expected: PASS. If FAIL, fix `descendantsCondition` in `entry-query.ts` until both cases pass.

- [ ] **Step 3: Commit**

```bash
git add packages/vulse/tests/integration/entry-query.test.ts
git commit -m "test(query): cover descendant CTE scoping with depth/includeSelf"
```

---

## Task 4: `countEntryQuery`

**Files:**
- Modify: `packages/vulse/src/core/repos/entry-query.ts`
- Test: `packages/vulse/tests/integration/entry-query.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/entry-query.test.ts`. Add `countEntryQuery` to the import at the top of the file:

```ts
import { runEntryQuery, countEntryQuery, type EntryQuerySpec } from '../../src/core/repos/entry-query'
```

Then add the test inside the `describe`:

```ts
  it('counts matches ignoring limit and offset', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'p1', content: { views: 1 }, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'post', slug: 'p2', content: { views: 2 }, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'post', slug: 'p3', content: { views: 3 }, createdBy: 'u1', status: 'published' })
    const db = createDb(env.DB)

    const total = await countEntryQuery(db, spec({
      where: { combine: 'and', nodes: [{ field: 'status', op: 'eq', value: 'published' }] },
      limit: 1,
      offset: 1,
    }))
    expect(total).toBe(3)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/integration/entry-query.test.ts -t "counts matches"`
Expected: FAIL — `countEntryQuery is not exported`.

- [ ] **Step 3: Implement**

Append to `packages/vulse/src/core/repos/entry-query.ts`:

```ts
export async function countEntryQuery(db: VulseDb, spec: EntryQuerySpec): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` })
    .from(entries)
    .innerJoin(entryLocales, eq(entryLocales.entryId, entries.id))
    .where(buildWhere(spec))
  return row?.n ?? 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/integration/entry-query.test.ts -t "counts matches"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/core/repos/entry-query.ts packages/vulse/tests/integration/entry-query.test.ts
git commit -m "feat(query): add countEntryQuery ignoring limit/offset"
```

---

## Task 5: `WhereBuilder` + `CollectionQuery` spec construction

**Files:**
- Create: `packages/vulse/src/server/sdk/query.ts`
- Test: `packages/vulse/tests/unit/query-builder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/vulse/tests/unit/query-builder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { WhereBuilder, CollectionQuery } from '../../src/server/sdk/query'

describe('WhereBuilder', () => {
  it('builds an AND group of conditions', () => {
    const b = new WhereBuilder()
    b.where('status', 'published').where('content.views', '>=', 100)
    expect(b.group).toEqual({
      combine: 'and',
      nodes: [
        { field: 'status', op: 'eq', value: 'published' },
        { field: 'content.views', op: 'gte', value: 100 },
      ],
    })
  })

  it('flips the group to OR when orWhere is used', () => {
    const b = new WhereBuilder()
    b.where('content.views', '>=', 100).orWhere('createdBy', '=', 'a1')
    expect(b.group.combine).toBe('or')
    expect(b.group.nodes).toHaveLength(2)
  })

  it('nests a group via andWhere', () => {
    const b = new WhereBuilder()
    b.andWhere((q) => q.where('content.views', '>=', 100).orWhere('createdBy', '=', 'a1'))
    expect(b.group).toEqual({
      combine: 'and',
      nodes: [
        { combine: 'or', nodes: [
          { field: 'content.views', op: 'gte', value: 100 },
          { field: 'createdBy', op: 'eq', value: 'a1' },
        ] },
      ],
    })
  })
})

describe('CollectionQuery spec construction', () => {
  // db is unused when .locale() is set (no readLocalesConfig call); reg unused until a terminal.
  const make = () => new CollectionQuery(null as never, null as never, 'post').locale('en')

  it('defaults status to published when no status condition is present', async () => {
    const spec = await make().where('content.views', '>=', 10).toSpec()
    expect(spec.collection).toBe('post')
    expect(spec.locale).toBe('en')
    expect(spec.where).toEqual({
      combine: 'and',
      nodes: [
        { combine: 'and', nodes: [{ field: 'content.views', op: 'gte', value: 10 }] },
        { field: 'status', op: 'eq', value: 'published' },
      ],
    })
  })

  it('does not inject a default status when one is supplied', async () => {
    const spec = await make().where('status', 'draft').toSpec()
    expect(spec.where).toEqual({ combine: 'and', nodes: [{ field: 'status', op: 'eq', value: 'draft' }] })
  })

  it('applies when() only on truthy condition', async () => {
    const withTag = await make().when('news', (q) => q.where('content.tag', '=', 'news')).toSpec()
    expect(JSON.stringify(withTag.where)).toContain('content.tag')
    const withoutTag = await make().when('', (q) => q.where('content.tag', '=', 'news')).toSpec()
    expect(JSON.stringify(withoutTag.where)).not.toContain('content.tag')
  })

  it('records descendants, orderBy, limit, offset', async () => {
    const spec = await make()
      .descendantsOf('p1', { depth: 2 })
      .orderBy('publishedAt', 'desc')
      .limit(20).offset(40)
      .toSpec()
    expect(spec.descendants).toEqual({ parentId: 'p1', depth: 2 })
    expect(spec.orderBy).toEqual([{ field: 'publishedAt', dir: 'desc' }])
    expect(spec.limit).toBe(20)
    expect(spec.offset).toBe(40)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/query-builder.test.ts`
Expected: FAIL — cannot resolve `../../src/server/sdk/query`.

- [ ] **Step 3: Implement the builder (spec construction only)**

Create `packages/vulse/src/server/sdk/query.ts`:

```ts
import type { VulseDb } from '../../core/db.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import type { AuthContext } from '../../core/blueprints/types.js'
import { readLocalesConfig } from '../../core/locales.js'
import type { Condition, EntryQuerySpec, Operator, QueryGroup } from '../../core/repos/entry-query.js'

const OP_ALIASES: Record<string, Operator> = {
  '=': 'eq', '!=': 'ne', '<>': 'ne', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte',
  in: 'in', 'not in': 'notIn', like: 'like',
}

function toOperator(op: string): Operator {
  return (OP_ALIASES[op] ?? op) as Operator
}

function makeCondition(field: string, rest: unknown[]): Condition {
  if (rest.length <= 1) return { field, op: 'eq', value: rest[0] }
  return { field, op: toOperator(String(rest[0])), value: rest[1] }
}

export class WhereBuilder {
  readonly group: QueryGroup = { combine: 'and', nodes: [] }

  where(field: string, ...rest: unknown[]): this {
    this.group.nodes.push(makeCondition(field, rest))
    return this
  }

  orWhere(arg: string | ((q: WhereBuilder) => void), ...rest: unknown[]): this {
    this.group.combine = 'or'
    if (typeof arg === 'function') {
      const child = new WhereBuilder()
      arg(child)
      this.group.nodes.push(child.group)
    } else {
      this.group.nodes.push(makeCondition(arg, rest))
    }
    return this
  }

  andWhere(cb: (q: WhereBuilder) => void): this {
    const child = new WhereBuilder()
    cb(child)
    this.group.nodes.push(child.group)
    return this
  }
}

function mentionsField(group: QueryGroup, field: string): boolean {
  return group.nodes.some((n) =>
    'combine' in n ? mentionsField(n, field) : n.field === field,
  )
}

export class CollectionQuery {
  private readonly where_ = new WhereBuilder()
  private localeName?: string
  private descendants_?: EntryQuerySpec['descendants']
  private orderBy_: { field: string; dir: 'asc' | 'desc' }[] = []
  private limit_?: number
  private offset_?: number
  protected includes: { field: string; as?: string }[] = []
  protected audience: AuthContext['user'] | null | undefined

  constructor(
    protected readonly db: VulseDb,
    protected readonly reg: BlueprintRegistry,
    protected readonly collection: string,
  ) {}

  locale(loc: string): this { this.localeName = loc; return this }

  where(field: string, ...rest: unknown[]): this { this.where_.where(field, ...rest); return this }

  orWhere(arg: string | ((q: WhereBuilder) => void), ...rest: unknown[]): this {
    this.where_.orWhere(arg as never, ...rest)
    return this
  }

  andWhere(cb: (q: WhereBuilder) => void): this { this.where_.andWhere(cb); return this }

  when(cond: unknown, cb: (q: this) => void): this { if (cond) cb(this); return this }

  descendantsOf(parentId: string, opts: { depth?: number; includeSelf?: boolean } = {}): this {
    this.descendants_ = { parentId, ...opts }
    return this
  }

  include(field: string, opts: { as?: string } = {}): this {
    this.includes.push({ field, ...opts })
    return this
  }

  forAudience(user: AuthContext['user'] | null): this { this.audience = user; return this }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): this {
    this.orderBy_.push({ field, dir })
    return this
  }

  limit(n: number): this { this.limit_ = n; return this }
  offset(n: number): this { this.offset_ = n; return this }

  async toSpec(): Promise<EntryQuerySpec> {
    const locale = this.localeName ?? (await readLocalesConfig(this.db)).defaultLocale
    const base = this.where_.group
    const where: QueryGroup = mentionsField(base, 'status')
      ? base
      : { combine: 'and', nodes: [base, { field: 'status', op: 'eq', value: 'published' }] }
    const spec: EntryQuerySpec = { collection: this.collection, locale, where }
    if (this.descendants_) spec.descendants = this.descendants_
    if (this.orderBy_.length) spec.orderBy = this.orderBy_
    if (this.limit_ !== undefined) spec.limit = this.limit_
    if (this.offset_ !== undefined) spec.offset = this.offset_
    return spec
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/query-builder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/server/sdk/query.ts packages/vulse/tests/unit/query-builder.test.ts
git commit -m "feat(query): add WhereBuilder and CollectionQuery spec construction"
```

---

## Task 6: Terminal methods (`all`, `first`, `count`, `exists`, `paginate`)

**Files:**
- Modify: `packages/vulse/src/server/sdk/query.ts`
- Test: `packages/vulse/tests/integration/query-sdk.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/vulse/tests/integration/query-sdk.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../../src/core/migrations'
import { createDb } from '../../src/core/db'
import { EntriesRepo } from '../../src/core/repos/entries'
import { BlueprintRegistry } from '../../src/core/blueprints/registry'
import { defineCollection, z } from '../../src/core/blueprints/define'
import { CollectionQuery } from '../../src/server/sdk/query'

function registry() {
  const reg = new BlueprintRegistry()
  reg.register(defineCollection({
    name: 'post',
    label: 'Post',
    schema: z.object({ title: z.string(), views: z.number().optional() }),
    admin: { titleField: 'title' },
    access: { read: ({ entry }) => entry?.status === 'published' },
  }))
  return reg
}

async function seed() {
  const repo = new EntriesRepo(createDb(env.DB))
  for (let i = 1; i <= 5; i++) {
    await repo.create({ collection: 'post', slug: `p${i}`, content: { title: `P${i}`, views: i * 10 }, createdBy: 'u1', status: 'published' })
  }
}

describe('CollectionQuery terminals', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('all() returns matching rows', async () => {
    await seed()
    const q = new CollectionQuery(createDb(env.DB), registry(), 'post').locale('default')
    const rows = await q.where('content.views', '>=', 30).all()
    expect(rows.map((r) => r.slug).sort()).toEqual(['p3', 'p4', 'p5'])
  })

  it('first() returns one row or null', async () => {
    await seed()
    const q = new CollectionQuery(createDb(env.DB), registry(), 'post').locale('default')
    const row = await q.orderBy('content.views', 'desc').first()
    expect(row?.slug).toBe('p5')
    const none = await new CollectionQuery(createDb(env.DB), registry(), 'post').locale('default')
      .where('content.views', '>=', 9999).first()
    expect(none).toBeNull()
  })

  it('count() and exists()', async () => {
    await seed()
    const base = () => new CollectionQuery(createDb(env.DB), registry(), 'post').locale('default')
    expect(await base().count()).toBe(5)
    expect(await base().where('content.views', '>=', 40).count()).toBe(2)
    expect(await base().where('content.views', '>=', 9999).exists()).toBe(false)
  })

  it('paginate() returns rows and total', async () => {
    await seed()
    const q = new CollectionQuery(createDb(env.DB), registry(), 'post').locale('default')
    const page = await q.orderBy('content.views', 'asc').paginate({ page: 2, perPage: 2 })
    expect(page.rows.map((r) => r.slug)).toEqual(['p3', 'p4'])
    expect(page.total).toBe(5)
    expect(page.pageCount).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/integration/query-sdk.test.ts`
Expected: FAIL — `q.where(...).all is not a function`.

- [ ] **Step 3: Implement terminals**

In `packages/vulse/src/server/sdk/query.ts`, extend the imports:

```ts
import { runEntryQuery, countEntryQuery } from '../../core/repos/entry-query.js'
import type { EntryRow } from '../../core/repos/entries.js'
```

Add these methods to the `CollectionQuery` class (after `toSpec`):

```ts
  async all(): Promise<EntryRow[]> {
    return runEntryQuery(this.db, await this.toSpec())
  }

  async first(): Promise<EntryRow | null> {
    this.limit_ = 1
    const rows = await this.all()
    return rows[0] ?? null
  }

  async count(): Promise<number> {
    return countEntryQuery(this.db, await this.toSpec())
  }

  async exists(): Promise<boolean> {
    return (await this.count()) > 0
  }

  async paginate(opts: { page: number; perPage: number }): Promise<{
    rows: EntryRow[]
    total: number
    page: number
    perPage: number
    pageCount: number
  }> {
    this.limit_ = opts.perPage
    this.offset_ = (opts.page - 1) * opts.perPage
    const rows = await this.all()
    const total = await this.count()
    return {
      rows,
      total,
      page: opts.page,
      perPage: opts.perPage,
      pageCount: Math.ceil(total / opts.perPage),
    }
  }
```

Note: `limit_`/`offset_` are referenced here, so change their declarations from `private` to `protected` if needed — they are already in the class. Keep them `private`; these methods are in the same class so `private` access is fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/integration/query-sdk.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/server/sdk/query.ts packages/vulse/tests/integration/query-sdk.test.ts
git commit -m "feat(query): add all/first/count/exists/paginate terminals"
```

---

## Task 7: `forAudience` access gating

**Files:**
- Modify: `packages/vulse/src/server/sdk/query.ts`
- Test: `packages/vulse/tests/integration/query-sdk.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/query-sdk.test.ts` inside the `describe`:

```ts
  it('forAudience drops rows the audience cannot read; count stays pre-gate', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'pub', content: { title: 'Pub' }, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'post', slug: 'draft', content: { title: 'Draft' }, createdBy: 'u1', status: 'draft' })

    // include both statuses in SQL so gating is what removes the draft
    const q = new CollectionQuery(createDb(env.DB), registry(), 'post')
      .locale('default')
      .where('status', 'in', ['draft', 'published'])
      .forAudience(null)

    const rows = await q.all()
    expect(rows.map((r) => r.slug)).toEqual(['pub'])

    const countQ = new CollectionQuery(createDb(env.DB), registry(), 'post')
      .locale('default')
      .where('status', 'in', ['draft', 'published'])
      .forAudience(null)
    expect(await countQ.count()).toBe(2) // pre-gate total
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/integration/query-sdk.test.ts -t "forAudience"`
Expected: FAIL — `all()` returns both rows (no gating yet).

- [ ] **Step 3: Implement gating**

In `packages/vulse/src/server/sdk/query.ts`, add the `evaluate` and `ValidationError` imports:

```ts
import { evaluate } from '../../core/access.js'
import { ValidationError } from '../../core/errors.js'
```

Add a private helper to `CollectionQuery`:

```ts
  /** Apply each entry's own blueprint read rule (entries may span collections via includes). */
  protected async gateEntries(rows: EntryRow[]): Promise<EntryRow[]> {
    if (this.audience === undefined) return rows
    const out: EntryRow[] = []
    for (const r of rows) {
      const bp = this.reg.get(r.collection)
      if (!bp) continue
      const ok = await evaluate(bp, 'read', {
        user: this.audience ?? null,
        entry: { id: r.id, status: r.status, createdBy: r.createdBy, content: r.content },
      })
      if (ok) out.push(r)
    }
    return out
  }
```

Change `all()` to gate after fetching:

```ts
  async all(): Promise<EntryRow[]> {
    const rows = await runEntryQuery(this.db, await this.toSpec())
    return this.gateEntries(rows)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/integration/query-sdk.test.ts -t "forAudience"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/server/sdk/query.ts packages/vulse/tests/integration/query-sdk.test.ts
git commit -m "feat(query): add opt-in forAudience access gating"
```

---

## Task 8: Relationship `include` resolution

**Files:**
- Modify: `packages/vulse/src/server/sdk/query.ts`
- Test: `packages/vulse/tests/integration/query-sdk.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/query-sdk.test.ts`. First add a registry with relation fields — add this helper near `registry()`:

```ts
function relRegistry() {
  const reg = new BlueprintRegistry()
  reg.register(defineCollection({
    name: 'author',
    label: 'Author',
    schema: z.object({ name: z.string() }),
    admin: { titleField: 'name' },
  }))
  reg.register(defineCollection({
    name: 'post',
    label: 'Post',
    schema: z.object({
      title: z.string(),
      author: z.string().ui({ kind: 'relationship', to: 'author' }),
      tags: z.array(z.string()).ui({ kind: 'entries', collections: ['author'] }).optional(),
    }),
    admin: { titleField: 'title' },
  }))
  return reg
}
```

Then add the tests inside the `describe`:

```ts
  it('include resolves a single relation and an array relation into row.relations', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const a1 = await repo.create({ collection: 'author', slug: 'a1', content: { name: 'Ann' }, createdBy: 'u1', status: 'published' })
    const a2 = await repo.create({ collection: 'author', slug: 'a2', content: { name: 'Bob' }, createdBy: 'u1', status: 'published' })
    await repo.create({
      collection: 'post', slug: 'p1',
      content: { title: 'P1', author: a1.id, tags: [a1.id, a2.id] },
      createdBy: 'u1', status: 'published',
    })

    const q = new CollectionQuery(createDb(env.DB), relRegistry(), 'post').locale('default')
    const rows = await q.include('author').include('tags').all()
    const r = rows[0] as typeof rows[0] & { relations: Record<string, unknown> }

    expect((r.relations.author as { slug: string }).slug).toBe('a1')
    expect((r.relations.tags as { slug: string }[]).map((e) => e.slug)).toEqual(['a1', 'a2'])
  })

  it('include with { as } overrides the attachment key', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    const a1 = await repo.create({ collection: 'author', slug: 'a1', content: { name: 'Ann' }, createdBy: 'u1', status: 'published' })
    await repo.create({ collection: 'post', slug: 'p1', content: { title: 'P1', author: a1.id }, createdBy: 'u1', status: 'published' })

    const q = new CollectionQuery(createDb(env.DB), relRegistry(), 'post').locale('default')
    const rows = await q.include('author', { as: 'writer' }).all()
    const r = rows[0] as typeof rows[0] & { relations: Record<string, unknown> }
    expect((r.relations.writer as { slug: string }).slug).toBe('a1')
  })

  it('include on a non-relation field throws', async () => {
    const repo = new EntriesRepo(createDb(env.DB))
    await repo.create({ collection: 'post', slug: 'p1', content: { title: 'P1', author: 'x' }, createdBy: 'u1', status: 'published' })
    const q = new CollectionQuery(createDb(env.DB), relRegistry(), 'post').locale('default')
    await expect(q.include('title').all()).rejects.toThrow(/not a relation/i)
  })
```

> Note: `z.string().ui(...)` — confirm the helper name used in `src/core/blueprints/zod-helpers.ts` during implementation; if the project attaches UI metadata via a different helper (e.g. `withUi(z.string(), {...})`), use that form in the test. The behavior under test (resolving ids found in content) is unaffected.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/integration/query-sdk.test.ts -t "include"`
Expected: FAIL — relations not attached.

- [ ] **Step 3: Implement include resolution**

In `packages/vulse/src/server/sdk/query.ts`, add imports:

```ts
import { EntriesRepo } from '../../core/repos/entries.js'
import { fieldDescriptorsFromBlueprint } from '../../core/blueprints/reflect-fields.js'
```

Add a relation-field lookup helper at module scope (below `mentionsField`):

```ts
const RELATION_WIDGETS = new Set(['ref', 'entry', 'entries'])

interface RelationField { field: string; multiple: boolean }

function relationField(reg: BlueprintRegistry, collection: string, field: string): RelationField {
  const bp = reg.get(collection)
  if (!bp) throw new ValidationError(`Unknown collection: ${collection}`)
  const desc = fieldDescriptorsFromBlueprint(bp).find((d) => d.path === field)
  if (!desc || !RELATION_WIDGETS.has(desc.widget)) {
    throw new ValidationError(`Field "${field}" on "${collection}" is not a relation`)
  }
  return { field, multiple: desc.widget === 'entries' }
}

function extractIds(content: unknown, field: string): string[] {
  const value = (content as Record<string, unknown> | null)?.[field]
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  return typeof value === 'string' ? [value] : []
}
```

Add a private resolver method to `CollectionQuery`:

```ts
  private async resolveIncludes(rows: EntryRow[], locale: string): Promise<void> {
    if (this.includes.length === 0) return
    const repo = new EntriesRepo(this.db)
    for (const inc of this.includes) {
      const def = relationField(this.reg, this.collection, inc.field)
      const key = inc.as ?? inc.field
      const ids = new Set<string>()
      for (const r of rows) for (const id of extractIds(r.content, inc.field)) ids.add(id)
      const fetched = await repo.findManyByIds([...ids], locale)
      const gated = await this.gateEntries(fetched)
      const byId = new Map(gated.map((e) => [e.id, e]))
      for (const r of rows) {
        const rowIds = extractIds(r.content, inc.field)
        const related = def.multiple
          ? rowIds.map((id) => byId.get(id)).filter((e): e is EntryRow => e !== undefined)
          : (byId.get(rowIds[0]) ?? null)
        const withRel = r as EntryRow & { relations?: Record<string, unknown> }
        withRel.relations = { ...(withRel.relations ?? {}), [key]: related }
      }
    }
  }
```

Update `all()` to resolve includes after gating:

```ts
  async all(): Promise<EntryRow[]> {
    const spec = await this.toSpec()
    const rows = await this.gateEntries(await runEntryQuery(this.db, spec))
    await this.resolveIncludes(rows, spec.locale)
    return rows
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/integration/query-sdk.test.ts -t "include"`
Expected: PASS (all three include tests).

- [ ] **Step 5: Commit**

```bash
git add packages/vulse/src/server/sdk/query.ts packages/vulse/tests/integration/query-sdk.test.ts
git commit -m "feat(query): resolve relationship includes into row.relations"
```

---

## Task 9: Wire `query()` into the SDK

**Files:**
- Modify: `packages/vulse/src/server/sdk/index.ts`
- Test: `packages/vulse/tests/integration/query-sdk.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/query-sdk.test.ts`. Add the import at the top:

```ts
import { createSdk } from '../../src/server/sdk/index'
```

Add the test inside the `describe`:

```ts
  it('is reachable via createSdk().query', async () => {
    await seed()
    const fakeAuth = { api: { getSession: async () => null } } as never
    const sdk = createSdk(createDb(env.DB), fakeAuth, registry(), { accountHash: undefined, token: undefined } as never)
    const rows = await sdk.query('post').where('content.views', '>=', 40).all()
    expect(rows.map((r) => r.slug).sort()).toEqual(['p4', 'p5'])
  })
```

> Note: match the `CfImagesConfig` shape in `src/server/cf-images.ts` when constructing the 4th `createSdk` argument; the cast above is a placeholder if the real shape differs. `media` is not exercised here.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/integration/query-sdk.test.ts -t "createSdk"`
Expected: FAIL — `sdk.query is not a function`.

- [ ] **Step 3: Implement wiring**

In `packages/vulse/src/server/sdk/index.ts`, add the import:

```ts
import { CollectionQuery } from './query.js'
```

Add a `query` factory to the returned object inside `createSdk`:

```ts
  return {
    collections: collectionsSdk(db, registry),
    query: (collection: string) => new CollectionQuery(db, registry, collection),
    media: mediaSdk(db, cfImages),
    search: searchSdk(db),
    auth: {
      session: (request: Request) => auth.api.getSession({ headers: request.headers }),
    },
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/integration/query-sdk.test.ts -t "createSdk"`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm exec tsc -p tsconfig.json --noEmit && pnpm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/vulse/src/server/sdk/index.ts packages/vulse/tests/integration/query-sdk.test.ts
git commit -m "feat(query): expose rt.sdk.query(collection) via createSdk"
```

---

## Task 10: Documentation

**Files:**
- Modify: `docs/frontend.md`

- [ ] **Step 1: Add the "Query builder" section**

In `docs/frontend.md`, after the "Runtime SDK (SSR)" section (ends before "## Blocks"), insert a new `## Query builder` section. Write it to cover, with runnable examples, all of the following (use the same `rt` setup shown in the Runtime SDK section above it):

- Getting a builder: `const q = rt.sdk.query('post')`.
- Default behavior: results are `status = 'published'` unless a `status` condition is supplied; default locale unless `.locale()` is set.
- `.where(field, op, value)` and the 2-arg `.where(field, value)` eq shorthand.
- Full operator table: `eq` (`=`), `ne` (`!=`), `gt` (`>`), `gte` (`>=`), `lt` (`<`), `lte` (`<=`), `in`, `notIn`, `like` (substring), `startsWith`, `endsWith`, `between` (`[lo, hi]`), `isNull`, `notNull`, `contains` (array membership on a `content.*` array field).
- JSON content filtering: `content.featured`, nested `content.seo.title`; note booleans work directly.
- Boolean composition: top-level AND; `.orWhere(...)` flips the current group to OR; `.andWhere(q => ...)` nests a group. Show the worked example producing `featured = true AND (views >= 100 OR createdBy = X)`.
- `.when(cond, q => ...)` for optional filters.
- `.descendantsOf(parentId, { depth?, includeSelf? })`: unlimited vs `depth: 1` (direct children) vs `includeSelf: true`; combinable with `where`/`orderBy`.
- `.include(field, { as? })`: resolves relationship/entry/entries content fields; results attach to `row.relations[field]` (single → entry-or-null, multiple → ordered array).
- `.forAudience(user | null)`: layers blueprint `read` gating on results. **Caveat:** `count()` and `limit`/`offset` reflect pre-gate totals; for exact gated counts, filter `status`/`createdBy` in SQL.
- Terminals: `.all()`, `.first()`, `.count()`, `.exists()`, `.paginate({ page, perPage })` → `{ rows, total, page, perPage, pageCount }`.
- One full worked example: a published, paginated, gated author archive with included tags.

Use this exact opening example so docs match the implemented API:

````markdown
## Query builder

For request-time filtering beyond `find()`, use the fluent query builder. It runs
as SQL against D1 and supports JSON-field filters, boolean groups, tree scoping,
relationship resolution, counting, and pagination.

```ts
const archive = await rt.sdk.query('post')
  .where('content.featured', '=', true)
  .andWhere((q) => q
    .where('content.views', '>=', 100)
    .orWhere('createdBy', '=', authorId))
  .descendantsOf(sectionId, { depth: 2 })
  .include('author')
  .forAudience(session?.user ?? null)
  .orderBy('publishedAt', 'desc')
  .paginate({ page: 1, perPage: 20 })

// archive.rows[0].relations.author -> resolved author entry (or null)
// archive.total, archive.pageCount
```

Results default to `status = 'published'` unless you add a `status` condition.
````

- [ ] **Step 2: Update the cheat sheet**

In the `## Cheat sheet` table at the end of `docs/frontend.md`, add these rows:

```markdown
| Filter posts by a JSON field at request time | `rt.sdk.query('post').where('content.featured','=',true).all()` |
| Get a whole subtree of a tree collection | `rt.sdk.query('docs').descendantsOf(parentId).all()` |
| Resolve a relationship field | `rt.sdk.query('post').include('author').all()` |
| Count / paginate matching entries | `rt.sdk.query('post').where(...).count()` / `.paginate({ page, perPage })` |
```

- [ ] **Step 3: Add a "loader vs find vs query" note**

Under "## Two ways to read content", add a short paragraph: the build-time loader syncs the full published set for SSG; `rt.sdk.collections.find()` is a simple filtered SSR read; `rt.sdk.query()` is the full query builder for JSON filters, tree scoping, relationships, counting, and pagination.

- [ ] **Step 4: Commit**

```bash
git add docs/frontend.md
git commit -m "docs(frontend): document the content query builder"
```

---

## Self-Review notes

- **Spec coverage:** descendants (Task 3), basic where (Task 2), conditional `when` (Task 5), JSON where (Task 2), relationships via `include` (Task 8), operators incl. `contains` (Task 2), count (Task 4), pagination (Task 6), fluent builder (Task 5), opt-in `forAudience` with pre-gate count caveat (Task 7), `row.relations.*` attachment (Task 8), docs (Task 10). All spec sections map to a task.
- **Type consistency:** `EntryQuerySpec`, `QueryGroup`, `Condition`, `Operator` defined in Task 2 and imported unchanged in Task 5/6. `CollectionQuery`/`WhereBuilder` signatures defined in Task 5 are extended (not redefined) in Tasks 6–8. `joinToEntry`/`findManyByIds` defined in Task 1 are used in Tasks 2 and 8.
- **Two implementation-time confirmations flagged inline:** the `z....ui()` UI-metadata helper name (Task 8 Step 1) and the `CfImagesConfig` shape (Task 9 Step 1). Both are test-construction details, not behavior; verify against the named source files when implementing.
```
