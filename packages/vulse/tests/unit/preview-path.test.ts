import { describe, expect, it } from 'vitest'

import {
  defaultPreviewPath,
  resolvePreviewConfig,
  resolvePreviewPath,
} from '../../src/core/blueprints/preview-path.js'

describe('preview-path helpers', () => {
  it('defaults page collections to root slug path', () => {
    expect(defaultPreviewPath('page')).toBe('/{slug}')
  })

  it('defaults other collections to /{handle}/{slug}', () => {
    expect(defaultPreviewPath('post')).toBe('/post/{slug}')
    expect(defaultPreviewPath('recipe')).toBe('/recipe/{slug}')
  })

  it('uses blueprint preview.path when set', () => {
    expect(resolvePreviewPath({
      name: 'recipe',
      preview: { path: '/recipes/{slug}' },
    })).toBe('/recipes/{slug}')
  })

  it('falls back when preview.path is missing', () => {
    expect(resolvePreviewPath({ name: 'post' })).toBe('/post/{slug}')
  })

  it('resolvePreviewConfig preserves live and rootSelector', () => {
    expect(resolvePreviewConfig({
      name: 'post',
      preview: { path: '/blog/{slug}', rootSelector: 'article', live: false },
    })).toEqual({
      path: '/blog/{slug}',
      rootSelector: 'article',
      live: false,
    })
  })
})
