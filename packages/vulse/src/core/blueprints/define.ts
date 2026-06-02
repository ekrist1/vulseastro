import type { z as Zod } from 'zod'
import type { Blueprint } from './types.js'
import { z } from './zod-helpers.js'

export function defineCollection<S extends Zod.ZodTypeAny>(input: Blueprint<S>): Blueprint<S> {
  if (!input.name || !/^[a-z][a-z0-9_-]*$/.test(input.name)) {
    throw new Error(`Blueprint "${input.name}": name must be lowercase kebab/snake case`)
  }
  return input
}

export { z }
