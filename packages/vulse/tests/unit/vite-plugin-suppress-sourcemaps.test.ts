import { describe, expect, it } from 'vitest'
import { vulseSuppressSourcemapsPlugin } from '../../src/integration/vite-plugin-suppress-sourcemaps'

describe('vulseSuppressSourcemapsPlugin', () => {
  it('ignores Vite virtual module ids', () => {
    const plugin = vulseSuppressSourcemapsPlugin()
    expect(typeof plugin.load).toBe('function')

    expect(
      (plugin.load as (id: string) => unknown)('\0/@tailwindcss/node/dist/require-cache.js?commonjs-es-import'),
    ).toBeUndefined()
  })
})
