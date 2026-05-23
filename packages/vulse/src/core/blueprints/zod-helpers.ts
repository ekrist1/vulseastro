import { z as astroZ } from 'astro/zod'
import { blockSchema } from '../blocks/schema.js'

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

/** Reference to another collection (or 'user'). */
export function ref(target: string) {
  return astroZ.string().min(1).describe(`vulse:ref:${target}`)
}

export type VulseZ = typeof astroZ & { media: typeof media; ref: typeof ref }

export const z: VulseZ = new Proxy(astroZ, {
  get(target, prop, receiver) {
    if (prop === 'media') return media
    if (prop === 'ref') return ref
    return Reflect.get(target, prop, receiver)
  },
}) as VulseZ
