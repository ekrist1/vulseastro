import { z } from 'zod'
import { SeoFieldMappingSchema } from './seo.js'

export const SelectOptionSchema = z.union([
  z.string().min(1),
  z.object({ key: z.string().min(1), label: z.string().min(1) }),
])

export const LinkValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('url'), url: z.string().min(1) }),
  z.object({
    type: z.literal('entry'),
    entryId: z.string().min(1),
    collection: z.string().min(1),
  }),
  z.object({ type: z.literal('first-child') }),
])

const textFieldUiSchema = z.object({ kind: z.literal('text') })
const textareaFieldUiSchema = z.object({ kind: z.literal('textarea') })
const blocksFieldUiSchema = z.object({
  kind: z.literal('blocks'),
  sets: z.array(z.string().regex(/^[a-z][a-z0-9_-]*$/)).optional(),
})
const dateFieldUiSchema = z.object({ kind: z.literal('date') })
const booleanFieldUiSchema = z.object({ kind: z.literal('boolean') })
const selectFieldUiSchema = z.object({
  kind: z.literal('select'),
  options: z.array(SelectOptionSchema).min(1),
  multiple: z.boolean().optional(),
  placeholder: z.string().optional(),
  clearable: z.boolean().optional(),
})
const relationshipFieldUiSchema = z.object({
  kind: z.literal('relationship'),
  to: z.string().min(1),
})
const entryFieldUiSchema = z.object({
  kind: z.literal('entry'),
  collections: z.array(z.string().min(1)).min(1),
})
const entriesFieldUiSchema = z.object({
  kind: z.literal('entries'),
  collections: z.array(z.string().min(1)).min(1),
  max: z.number().int().positive().optional(),
})
const linkFieldUiSchema = z.object({
  kind: z.literal('link'),
  collections: z.array(z.string().min(1)).optional(),
})
const assetFieldUiSchema = z.object({ kind: z.literal('asset') })

const nonReplicatorFieldUiSchemas = [
  textFieldUiSchema,
  textareaFieldUiSchema,
  blocksFieldUiSchema,
  dateFieldUiSchema,
  booleanFieldUiSchema,
  selectFieldUiSchema,
  relationshipFieldUiSchema,
  entryFieldUiSchema,
  entriesFieldUiSchema,
  linkFieldUiSchema,
  assetFieldUiSchema,
] as const

export const NonReplicatorFieldUiSchema = z.discriminatedUnion('kind', nonReplicatorFieldUiSchemas)

export const FieldValidationSchema = z
  .object({
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().positive().optional(),
  })
  .optional()

export const NestedFieldDefinitionSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  label: z.string().optional(),
  ui: NonReplicatorFieldUiSchema,
  optional: z.boolean(),
  default: z.unknown().optional(),
  validation: FieldValidationSchema,
})

export const ReplicatorSetSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  label: z.string().optional(),
  fields: z.array(NestedFieldDefinitionSchema).min(1),
})

const replicatorFieldUiSchema = z.object({
  kind: z.literal('replicator'),
  sets: z.array(ReplicatorSetSchema).min(1),
})

const gridFieldUiSchema = z.object({
  kind: z.literal('grid'),
  fields: z.array(NestedFieldDefinitionSchema).min(1),
  minRows: z.number().int().nonnegative().optional(),
  maxRows: z.number().int().positive().optional(),
  mode: z.enum(['table', 'stacked']).optional(),
  addLabel: z.string().optional(),
})

const fieldUiSchemas = [
  ...nonReplicatorFieldUiSchemas,
  replicatorFieldUiSchema,
  gridFieldUiSchema,
] as const

export const FieldUiSchema = z.discriminatedUnion('kind', fieldUiSchemas)

export const FieldDefinitionSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  label: z.string().optional(),
  ui: FieldUiSchema,
  optional: z.boolean(),
  default: z.unknown().optional(),
  validation: FieldValidationSchema,
})

export const PreviewDefinitionSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine((p) => p.startsWith('/'), 'path must start with /')
    .refine((p) => p.includes('{slug}'), 'path must include {slug}'),
  rootSelector: z.string().min(1).optional(),
  live: z.boolean().optional(),
})

const BlueprintDefinitionObjectSchema = z.object({
  handle: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  label: z.string().min(1),
  singleton: z.boolean(),
  tree: z.boolean().optional(),
  maxDepth: z.number().int().positive().optional(),
  drafts: z.boolean().optional(),
  seo: z.boolean().optional(),
  seoMapping: SeoFieldMappingSchema.optional(),
  preview: PreviewDefinitionSchema.optional(),
  fields: z.array(FieldDefinitionSchema).min(1),
})

function checkBlueprintConstraints(
  d: { singleton: boolean; tree?: boolean | undefined; maxDepth?: number | undefined },
  ctx: z.RefinementCtx,
) {
  if (d.singleton && d.tree) {
    ctx.addIssue({
      code: 'custom',
      message: 'A blueprint cannot be both singleton and tree-structured.',
      path: ['tree'],
    })
  }
  if (d.maxDepth !== undefined && !d.tree) {
    ctx.addIssue({
      code: 'custom',
      message: 'maxDepth requires tree: true.',
      path: ['maxDepth'],
    })
  }
}

export const BlueprintDefinitionSchema =
  BlueprintDefinitionObjectSchema.superRefine(checkBlueprintConstraints)

export type SelectOption = z.infer<typeof SelectOptionSchema>
export type LinkValue = z.infer<typeof LinkValueSchema>
export type NonReplicatorFieldUi = z.infer<typeof NonReplicatorFieldUiSchema>
export type NestedFieldDefinition = z.infer<typeof NestedFieldDefinitionSchema>
export type ReplicatorSetDefinition = z.infer<typeof ReplicatorSetSchema>
export type FieldUi = z.infer<typeof FieldUiSchema>
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>
export type PreviewDefinition = z.infer<typeof PreviewDefinitionSchema>
export type BlueprintDefinition = z.infer<typeof BlueprintDefinitionSchema>

export const FieldDefinitionWithRenameSchema = FieldDefinitionSchema.extend({
  previousName: z.string().optional(),
})
export const BlueprintDefinitionWithRenamesSchema = BlueprintDefinitionObjectSchema.extend({
  fields: z.array(FieldDefinitionWithRenameSchema).min(1),
}).superRefine(checkBlueprintConstraints)
export type FieldDefinitionWithRename = z.infer<typeof FieldDefinitionWithRenameSchema>
export type BlueprintDefinitionWithRenames = z.infer<typeof BlueprintDefinitionWithRenamesSchema>
