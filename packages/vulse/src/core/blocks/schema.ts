import { z } from 'astro/zod'

export const headingBlock = z.object({
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string(),
  id: z.string().optional(),
})

export const paragraphBlock = z.object({
  type: z.literal('paragraph'),
  text: z.string(),
  id: z.string().optional(),
})

export const imageBlock = z.object({
  type: z.literal('image'),
  mediaId: z.string(),
  alt: z.string().default(''),
  caption: z.string().optional(),
  id: z.string().optional(),
})

export const codeBlock = z.object({
  type: z.literal('code'),
  language: z.string(),
  code: z.string(),
  id: z.string().optional(),
})

export const embedBlock = z.object({
  type: z.literal('embed'),
  url: z.string().url(),
  id: z.string().optional(),
})

export const quoteBlock = z.object({
  type: z.literal('quote'),
  text: z.string(),
  cite: z.string().optional(),
  id: z.string().optional(),
})

export const listBlock = z.object({
  type: z.literal('list'),
  ordered: z.boolean().default(false),
  items: z.array(z.string()),
  id: z.string().optional(),
})

export const blockSchema = z.discriminatedUnion('type', [
  headingBlock,
  paragraphBlock,
  imageBlock,
  codeBlock,
  embedBlock,
  quoteBlock,
  listBlock,
])

export type Block = z.infer<typeof blockSchema>
export type BlockType = Block['type']

export const BUILT_IN_BLOCK_TYPES: BlockType[] = [
  'heading', 'paragraph', 'image', 'code', 'embed', 'quote', 'list',
]
