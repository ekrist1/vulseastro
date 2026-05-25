# Content Query Builder — Design

**Date:** 2026-05-25
**Status:** Approved (pending spec review)

## Summary

Extend Vulse's runtime content reading with a powerful, fluent query builder:
`rt.sdk.query(collection)`. It supports where clauses, nested AND/OR groups,
conditional clauses, JSON content-field filtering, tree-descendant scoping,
relationship resolution (`include`), counting, and pagination — all pushed down
to D1/SQLite where possible.

The build-time `vulseLoader` (Astro Content Layer) is intentionally **not**
changed: it continues to sync the full published set for static generation.
The existing `rt.sdk.collections.find()` / `findBySlug()` helpers also remain
as-is. The query builder is an additive surface for SSR filtering.

## Goals

- Fluent, chainable builder for filtered collection queries at request time.
- Filter on entry columns and on nested JSON content fields.
- Boolean composition: implicit top-level AND, explicit OR branches, nested groups.
- Conditional clauses (`when`) for ergonomic optional filters.
- Recursive tree-descendant scoping with optional depth limit.
- Resolve relationship fields into attached related entries (`include`).
- Count matching entries; paginate with totals.
- Common comparison operators including array membership.
- Opt-in per-entry access gating that composes predictably with SQL.

## Non-Goals

- Filtering parents by a *related entry's* fields (cross-collection JSON joins).
  Deferred. `include` resolves relations but does not filter by them.
- Changing the build-time loader's "sync everything" behavior.
- Pushing arbitrary blueprint `read` access rules into SQL.
- A public HTTP query endpoint. This is a server-side SDK only.

## Architecture

Three independently testable layers:

### 1. Query spec (core, serializable)

A plain object describing the query — no DB knowledge. Shape (illustrative):

```ts
type Operator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'notIn' | 'like' | 'startsWith' | 'endsWith'
  | 'between' | 'isNull' | 'notNull' | 'contains'

interface Condition { field: string; op: Operator; value?: unknown }
interface Group { combine: 'and' | 'or'; nodes: (Condition | Group)[] }

interface EntryQuerySpec {
  collection: string
  locale: string
  where: Group                      // root group, combine: 'and'
  descendants?: { parentId: string; depth?: number; includeSelf?: boolean }
  orderBy?: { field: string; dir: 'asc' | 'desc' }[]
  limit?: number
  offset?: number
}
```

`field` is either a known entry/locale column or a JSON path beginning with
`content.` (e.g. `content.author`, `content.seo.title`).

### 2. Compiler (core)

`packages/vulse/src/core/repos/entry-query.ts`:

- `runEntryQuery(db, spec): Promise<EntryRow[]>`
- `countEntryQuery(db, spec): Promise<number>` — same conditions, ignores
  `orderBy`/`limit`/`offset`.

Builds Drizzle/SQL against `vulse_entries ⋈ vulse_entry_locales` (inner join on
`entry_id`, filtered by `collection` + `locale`). Translation rules:

- **Columns** → direct Drizzle column references.
- **JSON paths** → `json_extract(content, '$.path')`.
- **Operators** → `=, !=, >, >=, <, <=, IN (...), NOT IN (...), LIKE,
  BETWEEN ? AND ?, IS NULL, IS NOT NULL`. `like` wraps the value as `%value%`;
  `startsWith`/`endsWith` anchor on one side. `contains` (array membership) →
  `EXISTS (SELECT 1 FROM json_each(content, '$.path') WHERE value = ?)`.
- **Booleans** → normalized to `1`/`0` (since `json_extract` yields `1`/`0`).
- **Groups** → parenthesized `AND`/`OR` per `combine`.
- **Descendants** → a `WITH RECURSIVE` CTE collecting subtree IDs; the main query
  adds `entries.id IN (subtree)`. `depth` caps recursion; `includeSelf` seeds the
  CTE with the parent row.

### 3. Fluent builder + SDK glue

`packages/vulse/src/server/sdk/query.ts` exports a `CollectionQuery` class. Each
builder method clones+mutates the accumulating spec and returns `this`. Terminal
methods run the compiler, then apply (in order) access gating and include
resolution. Wired into `sdk/index.ts` as `query(collection)`, alongside the
existing `find`. The builder closes over `db` and the `BlueprintRegistry` (same
as `collectionsSdk`).

## Builder API

```ts
rt.sdk.query('post')
  .locale('en')                              // optional; defaults to site default
  .where('content.featured', '=', true)      // (field, op, value)
  .where('status', 'published')              // (field, value) → eq shorthand
  .andWhere(q => q.where('content.views', '>=', 100)
                  .orWhere('createdBy', '=', authorId))  // nested group
  .when(tag, q => q.where('content.tag', '=', tag))      // conditional clause
  .descendantsOf(parentId, { depth: 2, includeSelf: false })
  .include('author')                         // resolve relation field
  .forAudience(session.user)                 // opt-in access gating
  .orderBy('publishedAt', 'desc')            // column or content.* path
  .limit(20).offset(40)
```

### Methods

| Method | Effect |
|--------|--------|
| `.locale(loc)` | Sets locale; default = site default locale (async-resolved at run). |
| `.where(field, op, value)` | Add condition to current group. |
| `.where(field, value)` | Shorthand for `eq`. |
| `.orWhere(field, op?, value)` | Add an OR branch at the current level. |
| `.andWhere(cb)` / `.orWhere(cb)` | Add a nested group built by `cb`. |
| `.when(cond, cb)` | Apply `cb(this)` only if `cond` is truthy. |
| `.descendantsOf(parentId, { depth?, includeSelf? })` | Scope to a subtree. |
| `.include(field, { as? })` | Resolve a relation field; attach to `relations`. |
| `.forAudience(user \| null)` | Apply blueprint `read` gating to results. |
| `.orderBy(field, dir = 'asc')` | Order by column or JSON path; repeatable. |
| `.limit(n)` / `.offset(n)` | Pagination primitives. |

### Terminal methods (async)

| Method | Returns |
|--------|---------|
| `.all()` | `EntryRow[]` (with `relations` attached if `include` used). |
| `.first()` | First `EntryRow` or `null` (applies `limit 1`). |
| `.count()` | `number` — total matches, ignoring `limit`/`offset`. |
| `.exists()` | `boolean`. |
| `.paginate({ page, perPage })` | `{ rows, total, page, perPage, pageCount }`. |

### Operators

`eq` (`=`), `ne` (`!=`), `gt` (`>`), `gte` (`>=`), `lt` (`<`), `lte` (`<=`),
`in`, `notIn`, `like` (substring contains), `startsWith`, `endsWith`, `between`
(value is `[lo, hi]`), `isNull`, `notNull`, `contains` (array membership).

String operators (`=`/`in`/`like`/symbols) are accepted as aliases for the named
operators where natural.

## Relationships (`include`)

`.include('author')`:

1. Reads the collection blueprint to find field `author`. It must be a relation
   field kind: `relationship` (single, `to`), `entry` (single, `collections[]`),
   or `entries` (multiple, `collections[]`). Otherwise → `ValidationError`.
2. Collects the referenced ID(s) from `content.author` across the result set.
3. Batch-fetches those entries by ID in one query (IDs are globally unique, so
   the target collection is not required to fetch), at the query's locale.
4. Attaches results under `row.relations[field]`:
   - single-relation field → one `EntryRow` or `null`,
   - `entries`/multiple → `EntryRow[]` preserving the stored order.

Includes are resolved **after** access gating, and resolved entries themselves
respect `forAudience` when set (a related entry the audience can't read resolves
to `null`, or is omitted from an array).

`{ as }` overrides the attachment key (e.g. `.include('author', { as: 'writer' })`
→ `row.relations.writer`).

## Access gating semantics

SQL-first, opt-in (chosen tradeoff):

- **Without `.forAudience()`** — pure SQL. `status` defaults to `published`
  unless a `status` condition is supplied. Pagination and `count()` are exact.
  Use for trusted/public queries.
- **With `.forAudience(user)`** — after the SQL fetch, each row is checked
  against the blueprint `read` rule via `core/access.evaluate`. Rows the audience
  cannot read are dropped. **Caveat (documented):** `count()` and `limit`/`offset`
  reflect pre-gate totals, because arbitrary read-rule functions can't be expressed
  in SQL. For exact gated counts, filter on `status`/`createdBy` directly in SQL.

## Security

- All values are **bound parameters** (Drizzle placeholders / `sql` params).
- Field names and JSON paths are validated against
  `^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$` before being interpolated into a
  `json_extract` path or mapped to a column. Unknown columns or invalid paths
  throw `ValidationError`. This prevents injection through the path string, which
  cannot be parameterized in SQLite's `json_extract`.
- Operators are validated against the known set.

## Error handling

Early, clear errors for: unknown collection, unknown column / invalid JSON path,
invalid operator, malformed `between` value, `include` on a non-relation field,
and invalid `descendantsOf` depth (`< 1`).

## Testing

- **Core compiler** (`entry-query.test.ts`) against the existing SQLite test DB:
  each operator; JSON path extraction (nested); boolean normalization; array
  `contains` via `json_each`; AND/OR group nesting; recursive descendants with and
  without `depth` and `includeSelf`; `count` ignoring order/limit/offset.
- **Builder** (`query-builder.test.ts`): spec accumulation; 2-arg vs 3-arg
  `where`; `orWhere`/nested groups; `when` true/false; `orderBy` repeat;
  `paginate` math; `include` single vs array and `as`; non-relation `include`
  error; field/path validation errors.
- **SDK end-to-end**: `forAudience` gating drops unreadable rows; pre-gate count
  caveat is asserted; `include` respects gating.

## Documentation (deliverable)

Comprehensive end-user docs are a required part of this work:

- New **"Query builder"** section in `docs/frontend.md` covering: getting a
  builder, all operators with examples, JSON content filtering, AND/OR groups,
  `when`, `descendantsOf`, `include` (with `relations` result shape), `forAudience`
  and its count/pagination caveat, `count`/`exists`/`paginate`, and a full
  worked example (filtered, paginated, gated author archive with included tags).
- Update the **cheat sheet** table in `docs/frontend.md`.
- A short note distinguishing when to use the loader vs `find()` vs the new
  `query()` builder.

## File plan

- `packages/vulse/src/core/repos/entry-query.ts` — spec types + compiler
  (`runEntryQuery`, `countEntryQuery`, path/operator validation).
- `packages/vulse/src/server/sdk/query.ts` — `CollectionQuery` fluent builder,
  gating, include resolution, `paginate`.
- `packages/vulse/src/server/sdk/index.ts` — expose `query(collection)`.
- `packages/vulse/src/core/repos/entries.ts` — possibly a small
  `findManyByIds(ids, locale)` helper for `include` (or co-locate in the builder).
- Tests as above.
- `docs/frontend.md` — query builder docs + cheat sheet.

## Open questions

None outstanding. Decisions captured: runtime SDK surface; fluent builder;
include = resolve-only attached at `row.relations.*`; descendants =
scope-filter + depth; access = opt-in `.forAudience()` SQL-first; `paginate`
included.
