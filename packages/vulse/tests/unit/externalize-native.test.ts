import { describe, it, expect } from 'vitest'
import { vulseExternalizeNativePlugin, isNativeExternal } from '../../src/integration/vite-plugin-externalize-native'

// Tailwind's oxide engine ships a .node binary. The integration externalized it only
// for the `ssr` environment, but Astro's prerender environment would still try to bundle
// it and rollup chokes parsing the ELF binary ("Unexpected character '\u{7f}'").
// These build-only natives must be external in EVERY environment.
describe('isNativeExternal', () => {
  it('externalizes the tailwind native packages and their subpaths', () => {
    expect(isNativeExternal('@tailwindcss/oxide')).toBe(true)
    expect(isNativeExternal('@tailwindcss/oxide/index.js')).toBe(true)
    expect(isNativeExternal('@tailwindcss/node')).toBe(true)
    expect(isNativeExternal('@tailwindcss/vite')).toBe(true)
    expect(isNativeExternal('tailwindcss')).toBe(true)
    expect(isNativeExternal('tailwindcss/colors')).toBe(true)
  })

  it('externalizes any .node native addon', () => {
    expect(isNativeExternal('/abs/path/tailwindcss-oxide.linux-x64-musl.node')).toBe(true)
    expect(isNativeExternal('./local.node')).toBe(true)
  })

  it('does not externalize Vulse runtime code or unrelated deps', () => {
    expect(isNativeExternal('@vulsecms/core')).toBe(false)
    expect(isNativeExternal('@vulsecms/core/server')).toBe(false)
    expect(isNativeExternal('vue')).toBe(false)
    expect(isNativeExternal('drizzle-orm/d1')).toBe(false)
    // substring traps: a package merely containing "tailwindcss" in its name is not a match
    expect(isNativeExternal('my-tailwindcss-helper')).toBe(false)
  })
})

describe('vulseExternalizeNativePlugin', () => {
  it('resolveId marks native ids external and passes others through', () => {
    const plugin = vulseExternalizeNativePlugin()
    const resolve = plugin.resolveId as (id: string) => { id: string; external: true } | null
    expect(resolve('@tailwindcss/oxide')).toEqual({ id: '@tailwindcss/oxide', external: true })
    expect(resolve('vue')).toBeNull()
  })

  it('runs before other resolvers', () => {
    expect(vulseExternalizeNativePlugin().enforce).toBe('pre')
  })
})
