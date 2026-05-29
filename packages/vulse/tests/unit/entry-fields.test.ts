import { describe, it, expect } from 'vitest'
import { inferEntryFields, isProseMirrorDoc } from '../../src/client/entry-fields'

describe('inferEntryFields', () => {
  it('classifies a ProseMirror doc as blocks', () => {
    const fields = inferEntryFields({
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    expect(fields).toEqual([{ name: 'body', kind: 'blocks' }])
  })

  it('classifies a legacy block array as blocks', () => {
    const fields = inferEntryFields({
      body: [{ type: 'heading', level: 1, text: 'Hi' }, { type: 'paragraph', text: 'x' }],
    })
    expect(fields).toEqual([{ name: 'body', kind: 'blocks' }])
  })

  it('classifies a {set, content} array as replicator', () => {
    const fields = inferEntryFields({
      sections: [
        { set: 'hero', content: { title: 'A' } },
        { set: 'quote', content: { text: 'B' } },
      ],
    })
    expect(fields).toEqual([{ name: 'sections', kind: 'replicator' }])
  })

  it('classifies a plain-object array (no set) as grid', () => {
    const fields = inferEntryFields({
      cast: [{ actor: 'Mark', role: 'Luke' }, { actor: 'Carrie', role: 'Leia' }],
    })
    expect(fields).toEqual([{ name: 'cast', kind: 'grid' }])
  })

  it('classifies booleans and falls back to text for scalars', () => {
    const fields = inferEntryFields({ title: 'Hello', featured: true, count: 3 })
    expect(fields).toEqual([
      { name: 'title', kind: 'text' },
      { name: 'featured', kind: 'boolean' },
      { name: 'count', kind: 'text' },
    ])
  })

  it('returns an empty list for non-object content', () => {
    expect(inferEntryFields(null)).toEqual([])
    expect(inferEntryFields('nope')).toEqual([])
  })

  it('detects ProseMirror docs', () => {
    expect(isProseMirrorDoc({ type: 'doc' })).toBe(true)
    expect(isProseMirrorDoc({ type: 'paragraph' })).toBe(false)
    expect(isProseMirrorDoc([])).toBe(false)
  })
})
