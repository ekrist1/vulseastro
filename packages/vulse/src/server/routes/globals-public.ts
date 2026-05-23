import type { VulseDb } from '../../core/db.js'
import { GlobalsRepo } from '../../core/repos/globals.js'
import { NotFoundError } from '../../core/errors.js'
import { fail, ok } from '../envelope.js'

export function globalsPublicRoutes(db: VulseDb) {
  const globals = new GlobalsRepo(db)

  return {
    list: async (): Promise<Response> => {
      try {
        return ok(await globals.publicValues())
      } catch (err) {
        return fail(err)
      }
    },

    get: async (_request: Request, rawParams: Record<string, string>): Promise<Response> => {
      try {
        const handle = rawParams.handle
        if (!handle) throw new NotFoundError('global set not found')
        const content = await globals.publicValue(handle)
        if (content === null) throw new NotFoundError('global set not found')
        return ok(content)
      } catch (err) {
        return fail(err)
      }
    },
  }
}
