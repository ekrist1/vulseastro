import { describe, it, expect, vi } from 'vitest'
import { adminApi, AdminApiError } from '../../src/admin/client/api.js'

describe('adminApi', () => {
  it('unwraps ok envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { id: 1 } }))))
    const r = await adminApi.get('/api/x')
    expect(r).toEqual({ id: 1 })
  })

  it('throws on fail envelope with code and message', async () => {
    const body = JSON.stringify({ ok: false, error: { code: 'VALIDATION', message: 'bad', details: { field: 'x' } } })
    const res = () => new Response(body, { status: 422 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res()).mockResolvedValueOnce(res()))
    await expect(adminApi.get('/api/x')).rejects.toMatchObject({ code: 'VALIDATION', message: 'bad', details: { field: 'x' } })
    await expect(adminApi.get('/api/x')).rejects.toBeInstanceOf(AdminApiError)
  })
})
