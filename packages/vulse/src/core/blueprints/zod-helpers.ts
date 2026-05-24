import { z as astroZ, type ZodRawShape, type ZodTypeAny } from 'astro/zod'
import { blockSchema } from '../blocks/schema.js'
import { LinkValueSchema } from './definition.js'

export const EMPTY_BLOCKS_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
} as const

export function blocks(sets?: string[]) {
  const tag = sets?.length ? `vulse:blocks:${sets.join(',')}` : 'vulse:blocks'
  return astroZ.any().default(EMPTY_BLOCKS_DOC).describe(tag)
}

/** Legacy flat block list (deprecated). */
export function blocksLegacy() {
  return astroZ.array(blockSchema).default([]).describe('vulse:blocks-legacy')
}

/** Media reference: stored as the media row's id; resolved at read time. */
export function media() {
  return astroZ.string().min(1).describe('vulse:media')
}

/** Reference to another collection (or 'user'). Kept for backward compatibility. */
export function ref(target: string) {
  return astroZ.string().min(1).describe(`vulse:ref:${target}`)
}

/** Single entry picker from one or more collections. */
export function entry(...collections: string[]) {
  if (collections.length === 0) throw new Error('entry() requires at least one collection')
  return astroZ.string().min(1).describe(`vulse:entry:${collections.join(',')}`)
}

/** Multi-entry picker from one or more collections. */
export function entries(collections: string[], max?: number) {
  if (collections.length === 0) throw new Error('entries() requires at least one collection')
  let schema = astroZ.array(astroZ.string().min(1))
  if (max !== undefined) schema = schema.max(max)
  const tag =
    max !== undefined
      ? `vulse:entries:${collections.join(',')}:${max}`
      : `vulse:entries:${collections.join(',')}`
  return schema.describe(tag)
}

/** URL, entry, or first-child link value. */
export function link(collections?: string[]) {
  const tag = collections?.length ? `vulse:link:${collections.join(',')}` : 'vulse:link'
  return LinkValueSchema.describe(tag)
}

/** Homogeneous row grid (array of objects with fixed columns). */
export function grid<T extends ZodRawShape>(
  fields: T,
  opts?: { minRows?: number; maxRows?: number },
) {
  let schema = astroZ.array(astroZ.object(fields))
  if (opts?.minRows !== undefined) schema = schema.min(opts.minRows)
  if (opts?.maxRows !== undefined) schema = schema.max(opts.maxRows)
  return schema.describe('vulse:grid')
}

export type VulseZ = typeof astroZ & {
  media: typeof media
  ref: typeof ref
  entry: typeof entry
  entries: typeof entries
  link: typeof link
  grid: typeof grid
}

export const z: VulseZ = new Proxy(astroZ, {
  get(target, prop, receiver) {
    if (prop === 'media') return media
    if (prop === 'ref') return ref
    if (prop === 'entry') return entry
    if (prop === 'entries') return entries
    if (prop === 'link') return link
    if (prop === 'grid') return grid
    return Reflect.get(target, prop, receiver)
  },
}) as VulseZ

export type { ZodTypeAny }
