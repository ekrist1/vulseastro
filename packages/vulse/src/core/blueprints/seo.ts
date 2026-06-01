import { z } from 'zod'
import type { FieldDescriptor } from './reflect-fields.js'

export const SEO_FIELD_PATH = 'seo'

export interface SeoContent {
  metaTitle?: string
  metaDescription?: string
  ogImage?: string
}

/** Maps blueprint content fields to SEO defaults. Omitted keys use inferred defaults. */
export interface SeoFieldMapping {
  metaTitle?: string
  metaDescription?: string
  ogImage?: string
}

export const SeoFieldMappingSchema = z.object({
  metaTitle: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).optional(),
  metaDescription: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).optional(),
  ogImage: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).optional(),
})

export interface ResolvedSeoField<T = string> {
  value: T | undefined
  sourceField?: string
  overridden: boolean
}

export interface ResolvedSeo {
  metaTitle: ResolvedSeoField
  metaDescription: ResolvedSeoField
  ogImage: ResolvedSeoField
}

interface BlockNode {
  type?: string
  text?: string
  content?: BlockNode[]
}

export function seoZodSchema(): z.ZodOptional<z.ZodObject<{
  metaTitle: z.ZodOptional<z.ZodString>
  metaDescription: z.ZodOptional<z.ZodString>
  ogImage: z.ZodOptional<z.ZodString>
}>> {
  return z.object({
    metaTitle: z.string().max(70).optional(),
    metaDescription: z.string().max(160).optional(),
    ogImage: z.string().describe('vulse:media').optional(),
  }).optional()
}

export function applySeoToSchema(
  schema: z.ZodObject<z.ZodRawShape>,
  seo?: boolean,
): z.ZodObject<z.ZodRawShape> {
  if (!seo) return schema
  if (SEO_FIELD_PATH in schema.shape) return schema
  return z.object({
    ...schema.shape,
    [SEO_FIELD_PATH]: seoZodSchema(),
  })
}

export function emptySeoContent(): SeoContent {
  return {}
}

function isProseMirrorDoc(v: unknown): v is BlockNode {
  return typeof v === 'object' && v !== null && (v as BlockNode).type === 'doc'
}

function plainTextFromRichContent(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim()
  if (!isProseMirrorDoc(value)) return ''
  const parts: string[] = []
  function walk(nodes: BlockNode[] | undefined) {
    for (const node of nodes ?? []) {
      if (node.type === 'text') parts.push(node.text ?? '')
      else walk(node.content)
    }
  }
  walk(value.content)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function truncateDescription(text: string, max = 160): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim()
}

export function resolveSeoFieldMapping(
  fields: Array<Pick<FieldDescriptor, 'path' | 'widget'>>,
  titleField: string,
  mapping?: SeoFieldMapping,
): SeoFieldMapping {
  const mediaField = fields.find((f) => f.widget === 'media')?.path
  const textareaField = fields.find((f) => f.widget === 'textarea')?.path
  const blocksField = fields.find((f) => f.widget === 'blocks')?.path
  const textField = fields.find((f) => f.widget === 'text' && f.path !== titleField)?.path

  const resolved: SeoFieldMapping = {
    metaTitle: mapping?.metaTitle ?? titleField,
  }
  const metaDescription = mapping?.metaDescription ?? textareaField ?? blocksField ?? textField
  if (metaDescription) resolved.metaDescription = metaDescription
  const ogImage = mapping?.ogImage ?? mediaField
  if (ogImage) resolved.ogImage = ogImage
  return resolved
}

export function extractSeoFieldValue(
  value: unknown,
  widget: FieldDescriptor['widget'] | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined
  switch (widget) {
    case 'media':
      return typeof value === 'string' && value ? value : undefined
    case 'textarea':
    case 'text':
      return typeof value === 'string' && value.trim() ? value.trim() : undefined
    case 'blocks':
      return plainTextFromRichContent(value) || undefined
    default:
      if (typeof value === 'string' && value.trim()) return value.trim()
      return undefined
  }
}

export function resolveEffectiveSeo(
  content: Record<string, unknown>,
  explicit: SeoContent | undefined,
  fields: FieldDescriptor[],
  titleField: string,
  mapping?: SeoFieldMapping,
): ResolvedSeo {
  const fieldByPath = new Map(fields.map((f) => [f.path, f]))
  const resolvedMapping = resolveSeoFieldMapping(fields, titleField, mapping)

  function resolveField(
    key: keyof SeoContent,
    mapKey: keyof SeoFieldMapping,
    transform?: (value: string) => string,
  ): ResolvedSeoField {
    const rawOverride = explicit?.[key]
    if (key === 'ogImage') {
      if (typeof rawOverride === 'string' && rawOverride) {
        return { value: rawOverride, overridden: true }
      }
    } else if (typeof rawOverride === 'string' && rawOverride.trim()) {
      return { value: rawOverride.trim(), overridden: true }
    }
    const sourceField = resolvedMapping[mapKey]
    if (!sourceField) return { value: undefined, overridden: false }
    const widget = fieldByPath.get(sourceField)?.widget
    const raw = extractSeoFieldValue(content[sourceField], widget)
    const value = raw && transform ? transform(raw) : raw
    return { value, sourceField, overridden: false }
  }

  return {
    metaTitle: resolveField('metaTitle', 'metaTitle'),
    metaDescription: resolveField('metaDescription', 'metaDescription', truncateDescription),
    ogImage: resolveField('ogImage', 'ogImage'),
  }
}

export function resolvedSeoSummary(resolved: ResolvedSeo): string {
  const title = resolved.metaTitle.value?.trim()
  if (title) return title
  const description = resolved.metaDescription.value?.trim()
  if (description) return truncateDescription(description, 70)
  if (resolved.ogImage.value) return 'Image configured'
  return 'No defaults available yet'
}
