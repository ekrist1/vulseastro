/**
 * Plain, serializable description of an entry's fields.
 *
 * This is a structural subset of the blueprint's FieldDefinition that carries no
 * Zod schemas or functions, so it can safely cross the Astro -> Vue island boundary
 * (island props are serialized to HTML) and drive `EntryRenderer.vue`.
 */
export interface EntryFieldDescriptor {
  name: string
  label?: string
  /** text | textarea | blocks | date | boolean | select | relationship | entry | entries | link | asset | replicator | grid */
  kind: string
  /** Grid columns (nested fields). */
  fields?: EntryFieldDescriptor[]
  /** Replicator sets, keyed by the `set` discriminant. */
  sets?: { name: string; label?: string; fields: EntryFieldDescriptor[] }[]
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A ProseMirror document, e.g. `{ type: 'doc', content: [...] }`. */
export function isProseMirrorDoc(v: unknown): v is Record<string, unknown> {
  return isPlainObject(v) && (v as { type?: unknown }).type === 'doc'
}

/** Legacy blocks are an array of tagged nodes, e.g. `{ type: 'paragraph', ... }`. */
function isLegacyBlockArray(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((item) => isPlainObject(item) && typeof (item as { type?: unknown }).type === 'string')
  )
}

/** Replicator rows are `{ set: string, content: object }`. */
function isReplicatorArray(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (item) =>
        isPlainObject(item) &&
        typeof (item as { set?: unknown }).set === 'string' &&
        isPlainObject((item as { content?: unknown }).content),
    )
  )
}

/** Grid rows are an array of plain objects without the replicator `set` discriminant. */
function isGridArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0 && v.every((item) => isPlainObject(item))
}

/**
 * Infer a field descriptor list from a content object purely from value shapes.
 *
 * Used as a fallback when no explicit descriptor is supplied. It cannot distinguish
 * an `asset` id from a plain string (both are strings), which is why the scaffold
 * inlines an explicit descriptor — but it reliably classifies the complex kinds
 * (blocks / grid / replicator) that are otherwise hard to render.
 */
export function inferEntryFields(content: unknown): EntryFieldDescriptor[] {
  if (!isPlainObject(content)) return []
  return Object.entries(content).map(([name, value]) => ({ name, kind: inferKind(value) }))
}

function inferKind(value: unknown): string {
  if (isProseMirrorDoc(value) || isLegacyBlockArray(value)) return 'blocks'
  if (isReplicatorArray(value)) return 'replicator'
  if (isGridArray(value)) return 'grid'
  if (typeof value === 'boolean') return 'boolean'
  return 'text'
}
