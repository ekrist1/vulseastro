import type { VulseDb } from '../../core/db.js'
import type { BlueprintRegistry } from '../../core/blueprints/registry.js'
import type { AuthContext } from '../../core/blueprints/types.js'
import { readLocalesConfig } from '../../core/locales.js'
import { runEntryQuery, countEntryQuery } from '../../core/repos/entry-query.js'
import type { Condition, EntryQuerySpec, Operator, QueryGroup } from '../../core/repos/entry-query.js'
import { EntriesRepo, type EntryRow } from '../../core/repos/entries.js'
import { fieldDescriptorsFromBlueprint } from '../../core/blueprints/reflect-fields.js'
import { evaluate } from '../../core/access.js'
import { ValidationError } from '../../core/errors.js'

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
        const firstId = rowIds[0]
        const related = def.multiple
          ? rowIds.map((id) => byId.get(id)).filter((e): e is EntryRow => e !== undefined)
          : (firstId ? byId.get(firstId) ?? null : null)
        const withRel = r as EntryRow & { relations?: Record<string, unknown> }
        withRel.relations = { ...(withRel.relations ?? {}), [key]: related }
      }
    }
  }

  async all(): Promise<EntryRow[]> {
    const spec = await this.toSpec()
    const rows = await this.gateEntries(await runEntryQuery(this.db, spec))
    await this.resolveIncludes(rows, spec.locale)
    return rows
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
}
