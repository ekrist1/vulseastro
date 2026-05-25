import { describe, expect, it } from 'vitest'
import { vulseAdminCssPlugin } from '../../src/integration/vite-plugin-admin-css'

describe('vulseAdminCssPlugin', () => {
  it('resolves admin.css via package export, not a raw absolute path', async () => {
    const plugin = vulseAdminCssPlugin()
    expect(typeof plugin.resolveId).toBe('function')

    const resolve = vi.fn(async (id: string) => ({
      id: `/project/node_modules/@vulsecms/core/src/admin/styles/admin.css`,
      external: false,
    }))

    const result = await (plugin.resolveId as Function).call(
      { resolve },
      '@vulsecms/core/admin.css',
      '/project/src/pages/admin.astro',
    )

    expect(resolve).toHaveBeenCalledWith('@vulsecms/core/admin.css', '/project/src/pages/admin.astro', {
      skipSelf: true,
    })
    expect(result).toBe('/project/node_modules/@vulsecms/core/src/admin/styles/admin.css')
    expect(result).not.toMatch(/^\/home\//)
  })

  it('falls back to the package import when resolve returns null', async () => {
    const plugin = vulseAdminCssPlugin()
    const resolve = vi.fn(async () => null)

    const result = await (plugin.resolveId as Function).call(
      { resolve },
      '../styles/admin.css',
      '/project/node_modules/@vulsecms/core/src/admin/components/AdminShell.astro',
    )

    expect(result).toBe('@vulsecms/core/admin.css')
  })
})
