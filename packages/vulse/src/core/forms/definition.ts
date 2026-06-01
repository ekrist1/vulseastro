import { z } from 'zod'

const handleRegex = /^[a-z][a-z0-9_-]*$/
const fieldNameRegex = /^[a-z_][a-z0-9_-]*$/

export const FormFieldValidationSchema = z.object({
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  email: z.boolean().optional(),
  url: z.boolean().optional(),
  integer: z.boolean().optional(),
  unique: z.boolean().optional(),
})

export type FormFieldValidation = z.infer<typeof FormFieldValidationSchema>

export const FormFieldUiSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text') }),
  z.object({ kind: z.literal('textarea') }),
  z.object({ kind: z.literal('email') }),
  z.object({ kind: z.literal('number') }),
  z.object({ kind: z.literal('date') }),
  z.object({ kind: z.literal('time') }),
  z.object({ kind: z.literal('datetime') }),
  z.object({ kind: z.enum(['select', 'radio']), options: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal('checkbox'), label: z.string().optional() }),
  z.object({
    kind: z.literal('file'),
    accept: z.array(z.string()).optional(),
    maxBytes: z.number().int().positive().optional(),
  }),
  z.object({ kind: z.literal('hidden'), value: z.string().optional() }),
  z.object({ kind: z.literal('honeypot') }),
  z.object({ kind: z.literal('submit'), label: z.string().optional() }),
])

export type FormFieldUi = z.infer<typeof FormFieldUiSchema>

export const FormFieldDefinitionSchema = z.object({
  name: z.string().regex(fieldNameRegex),
  label: z.string().optional(),
  ui: FormFieldUiSchema,
  optional: z.boolean(),
  default: z.unknown().optional(),
  validation: FormFieldValidationSchema.optional(),
})

export type FormFieldDefinition = z.infer<typeof FormFieldDefinitionSchema>

export const FormSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  successMessage: z.string().optional(),
  redirectTo: z.string().optional(),
  honeypotField: z.string().optional(),
  rateLimit: z.object({
    maxPerIp: z.number().int().positive(),
    windowSec: z.number().int().positive(),
  }).optional(),
  uploadDraftTtlHours: z.number().int().positive().optional(),
  notifyEmails: z.array(z.string().email()).optional(),
  confirmationEmail: z.object({
    enabled: z.boolean(),
    toField: z.string(),
    subject: z.string(),
    bodyTemplate: z.string(),
  }).optional(),
})

export type FormSettings = z.infer<typeof FormSettingsSchema>

export const FormActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('notify'),
    emails: z.array(z.string().email()),
    template: z.string().optional(),
  }),
  z.object({
    type: z.literal('confirmation'),
    toField: z.string(),
    subject: z.string(),
    bodyTemplate: z.string(),
  }),
  z.object({
    type: z.literal('webhook'),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
])

export type FormAction = z.infer<typeof FormActionSchema>

function rejectDuplicateFormFields(
  def: { fields: Array<{ name: string }> },
  ctx: z.RefinementCtx,
): void {
  const seen = new Map<string, number>()
  def.fields.forEach((field, index) => {
    const firstIndex = seen.get(field.name)
    if (firstIndex !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields', index, 'name'],
        message: `Duplicate field name '${field.name}' also used at fields.${firstIndex}.name.`,
      })
      return
    }
    seen.set(field.name, index)
  })
}

export const FormDefinitionSchema = z.object({
  handle: z.string().regex(handleRegex),
  label: z.string().min(1),
  fields: z.array(FormFieldDefinitionSchema).default([]),
  settings: FormSettingsSchema,
  actions: z.array(FormActionSchema).default([]),
}).superRefine(rejectDuplicateFormFields)

export type FormDefinition = z.infer<typeof FormDefinitionSchema>
