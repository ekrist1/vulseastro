import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { putToR2 } from '../../src/server/r2'

describe('r2 helpers', () => {
  it('puts and reads back', async () => {
    const body = new TextEncoder().encode('hello').buffer
    const { key } = await putToR2({ bucket: env.BUCKET }, body, 'text/plain')
    const obj = await env.BUCKET.get(key)
    expect(obj).toBeTruthy()
    const text = await obj!.text()
    expect(text).toBe('hello')
  })
})
