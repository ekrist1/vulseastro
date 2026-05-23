import { describe, it, expect } from 'vitest'
import { blockSchema } from '../../src/core/blocks/schema.js'

describe('blockSchema', () => {
  it('parses a heading block', () => {
    expect(blockSchema.parse({ type: 'heading', level: 2, text: 'Hi' })).toMatchObject({ type: 'heading' })
  })

  it('parses a paragraph block', () => {
    expect(blockSchema.parse({ type: 'paragraph', text: 'Hello world' }).type).toBe('paragraph')
  })

  it('parses an image block', () => {
    expect(blockSchema.parse({ type: 'image', mediaId: 'm1', alt: 'cat' }).type).toBe('image')
  })

  it('parses code block with language', () => {
    expect(blockSchema.parse({ type: 'code', language: 'ts', code: 'const x = 1' }).type).toBe('code')
  })

  it('parses embed block', () => {
    expect(blockSchema.parse({ type: 'embed', url: 'https://youtu.be/x' }).type).toBe('embed')
  })

  it('rejects unknown block types', () => {
    expect(() => blockSchema.parse({ type: 'unknown' })).toThrow()
  })
})
