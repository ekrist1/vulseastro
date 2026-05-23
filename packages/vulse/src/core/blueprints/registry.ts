import type { Blueprint } from './types.js'

export class BlueprintRegistry {
  #map = new Map<string, Blueprint>()

  register(bp: Blueprint): void {
    if (this.#map.has(bp.name)) throw new Error(`Blueprint "${bp.name}" already registered`)
    this.#map.set(bp.name, bp)
  }

  get(name: string): Blueprint | undefined { return this.#map.get(name) }
  list(): Blueprint[] { return [...this.#map.values()] }
  has(name: string): boolean { return this.#map.has(name) }
}
