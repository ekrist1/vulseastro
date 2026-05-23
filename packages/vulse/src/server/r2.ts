import { nanoid } from 'nanoid'

export interface UploadContext { bucket: R2Bucket }

export async function putToR2(ctx: UploadContext, body: ArrayBuffer, mime: string): Promise<{ key: string }> {
  const key = `${new Date().toISOString().slice(0, 10)}/${nanoid()}`
  await ctx.bucket.put(key, body, { httpMetadata: { contentType: mime } })
  return { key }
}

export async function deleteFromR2(ctx: UploadContext, key: string): Promise<void> {
  await ctx.bucket.delete(key)
}
