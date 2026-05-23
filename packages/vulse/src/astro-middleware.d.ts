declare module 'astro:middleware' {
  import type { MiddlewareHandler } from 'astro'
  export function defineMiddleware(fn: MiddlewareHandler): MiddlewareHandler
}
