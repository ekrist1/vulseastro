import type { z } from 'astro/zod'
import type { CompiledSet } from './compile.js'

interface PMNode {
  type?: unknown
  attrs?: unknown
  content?: unknown
}

function isNode(v: unknown): v is PMNode {
  return typeof v === 'object' && v !== null && 'type' in v
}

export function validateSetNodes(
  doc: unknown,
  basePath: (string | number)[],
  sets: Map<string, CompiledSet>,
  ctx: z.core.$RefinementCtx,
): void {
  if (!isNode(doc)) return
  walk(doc, basePath)

  function walk(node: PMNode, path: (string | number)[]): void {
    if (node.type === 'vulseSet') {
      const attrs = (node.attrs ?? {}) as Record<string, unknown>
      const handle = typeof attrs.set === 'string' ? attrs.set : undefined
      const data = (attrs.data ?? {}) as unknown
      const compiled = handle ? sets.get(handle) : undefined

      if (!compiled) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'set'],
          message: `unknown set: ${handle ?? '(empty)'}`,
        })
        return
      }

      const parsed = compiled.schema.safeParse(data)
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            ...issue,
            path: [...path, 'data', ...issue.path],
          })
        }
      }
      return
    }

    if (Array.isArray(node.content)) {
      node.content.forEach((child: unknown, i: number) => {
        if (isNode(child)) walk(child, [...path, 'content', i])
      })
    }
  }
}
