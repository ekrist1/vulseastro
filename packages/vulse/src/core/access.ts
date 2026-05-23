import type { Blueprint, AccessArgs } from './blueprints/types.js'

type Action = 'read' | 'create' | 'update' | 'delete'

export async function evaluate(bp: Blueprint, action: Action, args: AccessArgs): Promise<boolean> {
  const fn = bp.access?.[action]
  if (fn) return Boolean(await fn(args))
  return args.user?.role === 'admin'
}
