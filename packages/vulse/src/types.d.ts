declare module '*.sql?raw' {
  const content: string
  export default content
}

declare module 'virtual:vulse-blueprints' {
  import type { Blueprint } from './core/blueprints/types.js'
  const blueprints: Blueprint[]
  export default blueprints
}

declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>
}
