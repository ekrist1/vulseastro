import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { compileBlueprintSchema } from '../../src/core/blueprints/compile.js'
import { applySeoToSchema, resolveEffectiveSeo, resolvedSeoSummary, seoZodSchema } from '../../src/core/blueprints/seo.js'
import { fieldDescriptorsFromBlueprint } from '../../src/core/blueprints/reflect-fields.js'
import type { Blueprint } from '../../src/core/blueprints/types.js'

describe('SEO feature', () => {
  it('seoZodSchema accepts meta fields and og image id', () => {
    const parsed = seoZodSchema().parse({
      metaTitle: 'Custom title',
      metaDescription: 'Custom description',
      ogImage: 'media-123',
    })
    expect(parsed).toEqual({
      metaTitle: 'Custom title',
      metaDescription: 'Custom description',
      ogImage: 'media-123',
    })
  })

  it('applySeoToSchema adds seo object when enabled', () => {
    const base = z.object({ title: z.string() })
    const withSeo = applySeoToSchema(base, true)
    expect(Object.keys(withSeo.shape)).toEqual(['title', 'seo'])
    expect(withSeo.parse({ title: 'Hello', seo: { metaTitle: 'T' } })).toEqual({
      title: 'Hello',
      seo: { metaTitle: 'T' },
    })
  })

  it('applySeoToSchema is a no-op when disabled', () => {
    const base = z.object({ title: z.string() })
    expect(applySeoToSchema(base, false)).toBe(base)
  })

  it('compileBlueprintSchema injects seo when blueprint option is enabled', () => {
    const schema = compileBlueprintSchema({
      handle: 'post',
      label: 'Post',
      singleton: false,
      seo: true,
      fields: [{ name: 'title', ui: { kind: 'text' }, optional: false }],
    })
    expect(Object.keys(schema.shape)).toEqual(['title', 'seo'])
    expect(schema.parse({ title: 'A', seo: { metaDescription: 'Desc' } })).toEqual({
      title: 'A',
      seo: { metaDescription: 'Desc' },
    })
  })

  it('fieldDescriptorsFromBlueprint hides seo from auto-rendered fields', () => {
    const bp: Blueprint = {
      name: 'post',
      label: 'Post',
      seo: true,
      schema: applySeoToSchema(z.object({ title: z.string() }), true),
      admin: { titleField: 'title' },
    }
    const fields = fieldDescriptorsFromBlueprint(bp)
    expect(fields.map((f) => f.path)).toEqual(['title'])
  })

  it('resolveEffectiveSeo uses mapped fields and title fallback', () => {
    const resolved = resolveEffectiveSeo(
      { title: 'Is this one visible', body: 'Testing...', main_image: 'img-1' },
      undefined,
      [
        { path: 'title', widget: 'text', required: true },
        { path: 'body', widget: 'text', required: false },
        { path: 'main_image', widget: 'media', required: false },
      ],
      'title',
      { metaDescription: 'body', ogImage: 'main_image' },
    )
    expect(resolved.metaTitle.value).toBe('Is this one visible')
    expect(resolved.metaTitle.overridden).toBe(false)
    expect(resolved.metaDescription.value).toBe('Testing...')
    expect(resolved.ogImage.value).toBe('img-1')
    expect(resolvedSeoSummary(resolved)).toBe('Is this one visible')
  })

  it('resolveEffectiveSeo prefers explicit overrides', () => {
    const resolved = resolveEffectiveSeo(
      { title: 'Entry title' },
      { metaTitle: 'Custom SEO title' },
      [{ path: 'title', widget: 'text', required: true }],
      'title',
    )
    expect(resolved.metaTitle.value).toBe('Custom SEO title')
    expect(resolved.metaTitle.overridden).toBe(true)
  })
})
