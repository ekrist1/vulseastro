import type { VulseDb } from '../../core/db.js'
import { FormsRepo, FormUploadDraftsRepo } from '../../core/repos/forms.js'
import { MediaRepo } from '../../core/repos/media.js'
import { NotFoundError, ValidationError } from '../../core/errors.js'
import { fail, ok } from '../envelope.js'
import { putToR2 } from '../r2.js'

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const BLOCKED_MIME = new Set([
  'application/x-msdownload',
  'application/x-executable',
  'application/vnd.microsoft.portable-executable',
])

export interface FormUploadEnv {
  bucket: R2Bucket
}

export function formUploadRoutes(db: VulseDb, mediaEnv: FormUploadEnv) {
  const forms = new FormsRepo(db)
  const drafts = new FormUploadDraftsRepo(db)
  const media = new MediaRepo(db)

  return {
    upload: async (request: Request, rawParams: Record<string, string>): Promise<Response> => {
      try {
        const handle = rawParams.handle
        if (!handle) throw new ValidationError('handle required')
        const form = await forms.findByHandle(handle)
        if (!form || !form.enabled) throw new NotFoundError('form not found')

        const formData = await request.formData()
        const field = formData.get('field')
        const fileEntry = formData.get('file')
        if (typeof field !== 'string' || !field) throw new ValidationError('field required')
        if (!fileEntry || typeof fileEntry === 'string') throw new ValidationError('file required')

        const file = fileEntry as File
        const fieldDef = form.definition.fields.find((f) => f.name === field)
        if (!fieldDef || fieldDef.ui.kind !== 'file') {
          throw new ValidationError(`Unknown file field "${field}"`)
        }

        const maxBytes = fieldDef.ui.maxBytes ?? DEFAULT_MAX_BYTES
        if (file.size > maxBytes) throw new ValidationError(`File too large (max ${maxBytes} bytes)`)
        if (BLOCKED_MIME.has(file.type)) throw new ValidationError(`File type not allowed: ${file.type}`)

        if (fieldDef.ui.accept?.length) {
          const okMime = fieldDef.ui.accept.some((a) =>
            a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a,
          )
          if (!okMime) throw new ValidationError(`File type not allowed: ${file.type}`)
        }

        const buf = await file.arrayBuffer()
        const { key } = await putToR2({ bucket: mediaEnv.bucket }, buf, file.type || 'application/octet-stream')
        const row = await media.create({
          r2Key: key,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          uploadedBy: null,
        })

        const ttlHours = form.definition.settings.uploadDraftTtlHours ?? 24
        const expiresAt = new Date(Date.now() + ttlHours * 3600_000)
        const draft = await drafts.create({
          formHandle: handle,
          fieldName: field,
          mediaId: row.id,
          expiresAt,
        })

        return ok({ mediaId: row.id, draftId: draft.id, expiresAt: expiresAt.toISOString() })
      } catch (err) {
        return fail(err)
      }
    },
  }
}

export async function purgeExpiredFormUploadDrafts(
  db: VulseDb,
  bucket: R2Bucket,
): Promise<{ purged: number }> {
  const drafts = new FormUploadDraftsRepo(db)
  const media = new MediaRepo(db)
  const { deleteFromR2 } = await import('../r2.js')
  const expired = await drafts.listExpired(new Date())
  let purged = 0
  for (const draft of expired) {
    const row = await media.findById(draft.mediaId)
    if (row) {
      await deleteFromR2({ bucket }, row.r2Key)
      await media.hardDelete(row.id)
    }
    await drafts.delete(draft.id)
    purged++
  }
  return { purged }
}
