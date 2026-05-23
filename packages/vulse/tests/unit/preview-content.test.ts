import { describe, it, expect } from 'vitest'
import { resolvePreviewContent } from '../../src/core/preview-content.js'

describe('resolvePreviewContent', () => {
  const entry = {
    id: 'e1',
    content: { title: 'Published' },
    draftContent: { title: 'Draft' },
  }

  it('prefers live session when entryId matches', () => {
    const out = resolvePreviewContent(entry, {
      vulseLivePreview: { entryId: 'e1', collection: 'page', slug: 'x', content: { title: 'Live' } },
    })
    expect(out).toEqual({ title: 'Live' })
  })

  it('falls back to draft when preview cookie set', () => {
    const out = resolvePreviewContent(entry, { vulsePreview: true })
    expect(out).toEqual({ title: 'Draft' })
  })

  it('returns published content by default', () => {
    expect(resolvePreviewContent(entry, {})).toEqual({ title: 'Published' })
  })
})
