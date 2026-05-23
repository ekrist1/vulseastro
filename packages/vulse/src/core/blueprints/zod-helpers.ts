import { z as astroZ } from 'astro/zod'

/** Block-tree value: opaque JSON for now; Plan 4 narrows the schema. */
export function blocks() {
  return astroZ.array(astroZ.record(astroZ.string(), astroZ.unknown())).default([])
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
