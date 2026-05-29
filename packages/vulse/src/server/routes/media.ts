import { z } from 'astro/zod'
import type { VulseDb } from '../../core/db.js'
import type { Auth } from '../better-auth.js'
import type { AuthContext, Role } from '../../core/blueprints/types.js'
import { MediaRepo, type MediaRow } from '../../core/repos/media.js'
import { defineHandler } from '../handler.js'
import { putToR2, deleteFromR2 } from '../r2.js'
import { probeDimensions } from '../image-probe.js'
import { buildDeliveryUrl, publicMediaPath, type CfImagesConfig } from '../cf-images.js'
import { AccessDeniedError, NotFoundError, ValidationError } from '../../core/errors.js'
import { fail, ok } from '../envelope.js'

export interface MediaEnv {
  bucket: R2Bucket
  cfImages: CfImagesConfig
}

export interface MediaItem extends MediaRow {
  deliveryUrl: string | null
  previewUrl: string
}

const paramsId = z.object({ id: z.string() })

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
])
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB

export function mediaRoutes(db: VulseDb, auth: Auth, mediaEnv: MediaEnv) {
  const repo = new MediaRepo(db)

  function withUrls(row: MediaRow): MediaItem {
    const deliveryUrl = buildDeliveryUrl(mediaEnv.cfImages, row.id)
    return {
      ...row,
      deliveryUrl,
      // Public, cacheable route — works for both the admin UI and anonymous visitors.
      previewUrl: deliveryUrl ?? publicMediaPath(row.id),
    }
  }

  async function requireRole(request: Request, roles: Role[]): Promise<AuthContext> {
    const session = await auth.api.getSession({ headers: request.headers })
    const authCtx: AuthContext = session ? {
      user: {
        id: session.user.id,
        email: session.user.email,
        role: (session.user as { role?: Role }).role ?? 'member',
      },
    } : { user: null }
    if (!authCtx.user) throw new AccessDeniedError('Authentication required')
    if (!roles.includes(authCtx.user.role)) {
      throw new AccessDeniedError(`Requires role: ${roles.join(' or ')}`)
    }
    return authCtx
  }

  return {
    list: defineHandler(auth, { requireRole: ['admin', 'editor'] }, async () => {
      return (await repo.list({})).map(withUrls)
    }),

    upload: async (request: Request): Promise<Response> => {
      try {
        const authCtx = await requireRole(request, ['admin', 'editor'])
        const form = await request.formData()
        const entry = form.get('file')
        if (!entry || typeof entry === 'string') throw new ValidationError('file required')
        const file = entry as File
        if (!ALLOWED_MIME.has(file.type)) {
          throw new ValidationError(`Unsupported file type: ${file.type || 'unknown'}`)
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new ValidationError(`File too large (max ${MAX_UPLOAD_BYTES} bytes)`)
        }
        const buf = await file.arrayBuffer()
        if (buf.byteLength > MAX_UPLOAD_BYTES) {
          throw new ValidationError(`File too large (max ${MAX_UPLOAD_BYTES} bytes)`)
        }
        const dims = probeDimensions(buf, file.type)
        const { key } = await putToR2({ bucket: mediaEnv.bucket }, buf, file.type)
        const defaultAlt = file.name ? file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') : null
        const row = await repo.create({
          r2Key: key,
          mime: file.type,
          size: file.size,
          ...(dims?.width !== undefined ? { width: dims.width } : {}),
          ...(dims?.height !== undefined ? { height: dims.height } : {}),
          alt: defaultAlt,
          uploadedBy: authCtx.user!.id,
        })
        return ok(withUrls(row))
      } catch (err) {
        return fail(err)
      }
    },

    updateAlt: defineHandler(auth, {
      params: paramsId,
      body: z.object({ alt: z.string() }),
      requireRole: ['admin', 'editor'],
    }, async ({ params, body }) => {
      await repo.updateAlt(params.id, body.alt)
      return { ok: true }
    }),

    delete: defineHandler(auth, {
      params: paramsId,
      requireRole: ['admin', 'editor'],
    }, async ({ params }) => {
      await repo.softDelete(params.id)
      return { ok: true }
    }),

    file: async (request: Request, rawParams: Record<string, string>): Promise<Response> => {
      try {
        await requireRole(request, ['admin', 'editor'])
        const id = rawParams.id
        if (!id) throw new ValidationError('id required')
        const row = await repo.findById(id)
        if (!row || row.deletedAt) throw new NotFoundError(`Media ${id} not found`)
        const obj = await mediaEnv.bucket.get(row.r2Key)
        if (!obj) throw new NotFoundError(`Media file ${id} not found`)
        const headers = new Headers()
        if (obj.httpMetadata?.contentType) headers.set('content-type', obj.httpMetadata.contentType)
        headers.set('cache-control', 'private, max-age=3600')
        return new Response(obj.body, { headers })
      } catch (err) {
        return fail(err)
      }
    },

    // Public, unauthenticated media delivery for the frontend. Media bytes are
    // immutable per id (the r2Key never changes), so this is safe to cache hard
    // at the edge — which is also what lets Cloudflare Image Transformations
    // (`/cdn-cgi/image/…`) sit in front of it for compressed, resized delivery.
    publicFile: async (_request: Request, rawParams: Record<string, string>): Promise<Response> => {
      try {
        const id = rawParams.id
        if (!id) throw new ValidationError('id required')
        const row = await repo.findById(id)
        if (!row || row.deletedAt) throw new NotFoundError(`Media ${id} not found`)
        const obj = await mediaEnv.bucket.get(row.r2Key)
        if (!obj) throw new NotFoundError(`Media file ${id} not found`)
        const headers = new Headers()
        if (obj.httpMetadata?.contentType) headers.set('content-type', obj.httpMetadata.contentType)
        headers.set('cache-control', 'public, max-age=31536000, immutable')
        if (obj.httpEtag) headers.set('etag', obj.httpEtag)
        return new Response(obj.body, { headers })
      } catch (err) {
        return fail(err)
      }
    },

    purge: async (): Promise<{ purged: number }> => {
      const rows = await repo.listPurgeable(7)
      for (const r of rows) {
        await deleteFromR2({ bucket: mediaEnv.bucket }, r.r2Key)
        await repo.hardDelete(r.id)
      }
      return { purged: rows.length }
    },
  }
}
