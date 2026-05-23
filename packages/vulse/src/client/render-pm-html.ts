import { parseIframeCode } from './embed.js'
import type { BlockMark, BlockNode } from './pm-types.js'
import { sanitizeLinkHref, sanitizeMediaSrc } from './url.js'

const MARK_TAG: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  code: 'code',
  underline: 'u',
  strike: 's',
}

export interface RenderPmOptions {
  mediaUrl?: (id: string, variant?: string) => string
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function attr(name: string, value: string | undefined): string {
  return value ? ` ${name}="${esc(value)}"` : ''
}

export function isProseMirrorDoc(v: unknown): v is BlockNode {
  return typeof v === 'object' && v !== null && (v as BlockNode).type === 'doc'
}

export function docNodes(v: unknown): BlockNode[] {
  if (isProseMirrorDoc(v) && v.content) return v.content
  if (Array.isArray(v)) return v as BlockNode[]
  if (typeof v === 'object' && v !== null && 'type' in v) return [v as BlockNode]
  return []
}

function renderChildren(nodes: BlockNode[] | undefined, opts: RenderPmOptions): string {
  return (nodes ?? []).map((n) => renderNode(n, opts)).join('')
}

function renderText(node: BlockNode): string {
  let html = esc(node.text ?? '')
  for (const mark of (node.marks ?? []) as BlockMark[]) {
    if (mark.type === 'link') {
      const href = sanitizeLinkHref(mark.attrs?.href)
      if (href) html = `<a class="vulse-link" href="${esc(href)}">${html}</a>`
    } else if (MARK_TAG[mark.type]) {
      const tag = MARK_TAG[mark.type]!
      html = `<${tag}>${html}</${tag}>`
    }
  }
  return html
}

function renderIframe(node: BlockNode): string {
  const parsed = parseIframeCode(node.attrs?.code)
  const src = parsed?.src ?? sanitizeMediaSrc(node.attrs?.src)
  if (!src) return ''

  const title =
    parsed?.title ??
    (typeof node.attrs?.title === 'string' ? node.attrs.title : 'Embedded content')
  const loading = parsed?.loading === 'eager' ? 'eager' : 'lazy'
  const frameborder = parsed?.frameborder ?? '0'
  const allowfullscreen = parsed?.allowfullscreen ?? true

  return `<iframe data-vulse-embed="iframe" src="${esc(src)}" title="${esc(title)}" loading="${loading}" frameborder="${esc(frameborder)}"${allowfullscreen ? ' allowfullscreen' : ''}${attr('width', parsed?.width)}${attr('height', parsed?.height)}${attr('allow', parsed?.allow)}${attr('referrerpolicy', parsed?.referrerpolicy)}></iframe>`
}

function renderImage(node: BlockNode, opts: RenderPmOptions): string {
  const asset = node.attrs?.asset
  const id =
    (asset && typeof asset === 'object' && 'id' in asset ? (asset as { id: string }).id : null) ??
    (typeof node.attrs?.assetId === 'string' ? node.attrs.assetId : null)
  if (!id) return ''

  const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
  const caption = typeof node.attrs?.caption === 'string' ? node.attrs.caption : ''
  const imgSrc = opts.mediaUrl?.(id, 'hero')
  const img = imgSrc
    ? `<img src="${esc(imgSrc)}" alt="${esc(alt)}" />`
    : `<span class="text-zinc-400">[image: ${esc(id)}]</span>`
  const cap = caption ? `<figcaption>${esc(caption)}</figcaption>` : ''
  return `<figure data-vulse-block="image">${img}${cap}</figure>`
}

function renderNode(node: BlockNode, opts: RenderPmOptions): string {
  switch (node.type) {
    case 'text':
      return renderText(node)
    case 'paragraph':
      return `<p class="vulse-paragraph">${renderChildren(node.content, opts)}</p>`
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6)
      return `<h${level} class="vulse-heading">${renderChildren(node.content, opts)}</h${level}>`
    }
    case 'bulletList':
      return `<ul class="vulse-bullet-list">${renderChildren(node.content, opts)}</ul>`
    case 'orderedList':
      return `<ol class="vulse-ordered-list">${renderChildren(node.content, opts)}</ol>`
    case 'listItem':
      return `<li class="vulse-list-item">${renderChildren(node.content, opts)}</li>`
    case 'blockquote':
      return `<blockquote class="vulse-blockquote">${renderChildren(node.content, opts)}</blockquote>`
    case 'codeBlock': {
      const text = (node.content ?? []).map((c) => c.text ?? '').join('')
      const lang = node.attrs?.language
      const langAttr = typeof lang === 'string' ? ` data-language="${esc(lang)}"` : ''
      return `<pre class="vulse-code-block"><code${langAttr}>${esc(text)}</code></pre>`
    }
    case 'hardBreak':
      return '<br class="vulse-hard-break" />'
    case 'emoji': {
      const value = String(node.attrs?.value ?? '🙂')
      const label = typeof node.attrs?.label === 'string' ? node.attrs.label : null
      const aria = label ? ` aria-label="${esc(label)}"` : ''
      return `<span data-vulse-emoji${aria}>${esc(value)}</span>`
    }
    case 'vulseCallout': {
      const tone = (node.attrs?.tone as string | undefined) ?? 'info'
      return `<aside data-vulse-callout data-tone="${esc(tone)}">${renderChildren(node.content, opts)}</aside>`
    }
    case 'vulseAccordionGroup':
      return `<div data-vulse-accordion-group>${renderChildren(node.content, opts)}</div>`
    case 'vulseAccordion': {
      const summary = String(node.attrs?.summary ?? 'Accordion')
      const open = node.attrs?.open ? ' open' : ''
      return `<details data-vulse-accordion${open}><summary>${esc(summary)}</summary>${renderChildren(node.content, opts)}</details>`
    }
    case 'vulseIframe':
      return renderIframe(node)
    case 'vulseVideo': {
      const src = sanitizeMediaSrc(node.attrs?.src)
      if (!src) return ''
      return `<video data-vulse-embed="video" src="${esc(src)}" controls preload="metadata"></video>`
    }
    case 'vulseImage':
      return renderImage(node, opts)
    case 'vulseSet': {
      const setName = typeof node.attrs?.set === 'string' ? node.attrs.set : ''
      return `<div data-vulse-missing-set="${esc(setName)}"></div>`
    }
    default:
      return ''
  }
}

export function renderProseMirrorHtml(doc: unknown, opts: RenderPmOptions = {}): string {
  const nodes = docNodes(doc)
  return `<div class="vulse-doc">${nodes.map((n) => renderNode(n, opts)).join('')}</div>`
}
