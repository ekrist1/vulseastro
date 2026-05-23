import { describe, it, expect } from 'vitest'
import { isProseMirrorDoc, renderProseMirrorHtml } from '../../src/client/render-pm-html'

describe('renderProseMirrorHtml', () => {
  it('detects ProseMirror doc shape', () => {
    expect(isProseMirrorDoc({ type: 'doc', content: [] })).toBe(true)
    expect(isProseMirrorDoc([{ type: 'paragraph', text: 'x' }])).toBe(false)
  })

  it('renders paragraph and heading nodes', () => {
    const html = renderProseMirrorHtml({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Hello' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold ', marks: [] },
            { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    })

    expect(html).toContain('<h1 class="vulse-heading">Hello</h1>')
    expect(html).toContain('<p class="vulse-paragraph">Bold <strong>world</strong></p>')
  })

  it('resolves image mediaUrl', () => {
    const html = renderProseMirrorHtml(
      {
        type: 'doc',
        content: [
          {
            type: 'vulseImage',
            attrs: { assetId: 'img-1', alt: 'Alt text' },
          },
        ],
      },
      { mediaUrl: (id) => `/media/${id}` },
    )

    expect(html).toContain('src="/media/img-1"')
    expect(html).toContain('alt="Alt text"')
  })
})
