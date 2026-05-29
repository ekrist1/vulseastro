import { eq, and, gt, lt, sql, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { VulseDb } from '../db.js'
import {
  vulseForms,
  vulseFormSubmissions,
  vulseFormUniqueValues,
  vulseFormUploadDrafts,
} from '../schema.js'
import { NotFoundError, ValidationError } from '../errors.js'
import {
  type FormDefinition,
  FormDefinitionSchema,
} from '../forms/definition.js'

export interface FormRow {
  handle: string
  label: string
  definition: FormDefinition
  enabled: boolean
  createdAt: Date
  updatedAt: Date
  submissionCount?: number
}

function parseRow(row: typeof vulseForms.$inferSelect): FormRow {
  return {
    handle: row.handle,
    label: row.label,
    definition: FormDefinitionSchema.parse(row.definition),
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class FormsRepo {
  constructor(private db: VulseDb) {}

  async create(input: FormDefinition): Promise<FormRow> {
    const parsed = FormDefinitionSchema.safeParse(input)
    if (!parsed.success) throw new ValidationError('Invalid form', { issues: parsed.error.issues })
    const def = parsed.data
    const now = new Date()
    await this.db.insert(vulseForms).values({
      handle: def.handle,
      label: def.label,
      definition: def,
      enabled: def.settings.enabled,
      createdAt: now,
      updatedAt: now,
    })
    const row = await this.findByHandle(def.handle)
    if (!row) throw new Error(`form not found after create: ${def.handle}`)
    return row
  }

  async findByHandle(handle: string): Promise<FormRow | null> {
    const row = await this.db.select().from(vulseForms).where(eq(vulseForms.handle, handle)).get()
    return row ? parseRow(row) : null
  }

  async list(): Promise<FormRow[]> {
    const rows = await this.db
      .select({
        handle: vulseForms.handle,
        label: vulseForms.label,
        definition: vulseForms.definition,
        enabled: vulseForms.enabled,
        createdAt: vulseForms.createdAt,
        updatedAt: vulseForms.updatedAt,
        submissionCount: sql<number>`(
          SELECT COUNT(*) FROM vulse_form_submissions
          WHERE form_handle = ${vulseForms.handle}
        )`.mapWith(Number),
      })
      .from(vulseForms)
      .orderBy(vulseForms.createdAt)
    return rows.map((r) => ({
      ...parseRow({
        ...r,
        // The list query intentionally omits schemaVersion; supply the default
        // so parseRow's type-cast remains accurate without an over-broad `as`.
        schemaVersion: 1,
      } as typeof vulseForms.$inferSelect),
      submissionCount: r.submissionCount,
    }))
  }

  async update(handle: string, input: FormDefinition): Promise<FormRow> {
    if (input.handle !== handle) {
      throw new Error(`form handle is immutable (got '${input.handle}', expected '${handle}')`)
    }
    const parsed = FormDefinitionSchema.safeParse(input)
    if (!parsed.success) throw new ValidationError('Invalid form', { issues: parsed.error.issues })
    const def = parsed.data
    await this.db.update(vulseForms).set({
      label: def.label,
      definition: def,
      enabled: def.settings.enabled,
      updatedAt: new Date(),
    }).where(eq(vulseForms.handle, handle))
    const row = await this.findByHandle(handle)
    if (!row) throw new NotFoundError('form not found')
    return row
  }

  async delete(handle: string): Promise<void> {
    await this.db.delete(vulseForms).where(eq(vulseForms.handle, handle))
  }
}

export interface SubmissionMeta {
  ip?: string
  userAgent?: string
  referer?: string
  locale?: string
}

export interface FileRef {
  field: string
  mediaId: string
}

export interface SubmissionRow {
  id: string
  formHandle: string
  payload: Record<string, unknown>
  fileRefs: FileRef[]
  meta: SubmissionMeta
  status: 'received' | 'processed' | 'failed'
  error: string | null
  createdAt: Date
}

function parseSubmission(row: typeof vulseFormSubmissions.$inferSelect): SubmissionRow {
  return {
    id: row.id,
    formHandle: row.formHandle,
    payload: row.payload as Record<string, unknown>,
    fileRefs: (row.fileRefs ?? []) as FileRef[],
    meta: row.meta as SubmissionMeta,
    status: row.status,
    error: row.error ?? null,
    createdAt: row.createdAt,
  }
}

export class SubmissionsRepo {
  constructor(private db: VulseDb) {}

  async create(input: {
    formHandle: string
    payload: Record<string, unknown>
    fileRefs?: FileRef[]
    meta: SubmissionMeta
  }): Promise<SubmissionRow> {
    const now = new Date()
    const row = {
      id: nanoid(),
      formHandle: input.formHandle,
      payload: input.payload,
      fileRefs: input.fileRefs ?? [],
      meta: input.meta,
      status: 'received' as const,
      error: null,
      createdAt: now,
    }
    await this.db.insert(vulseFormSubmissions).values(row)
    return parseSubmission(row as typeof vulseFormSubmissions.$inferSelect)
  }

  async findById(id: string): Promise<SubmissionRow | null> {
    const row = await this.db.select().from(vulseFormSubmissions).where(eq(vulseFormSubmissions.id, id)).get()
    return row ? parseSubmission(row) : null
  }

  async list(opts: { formHandle: string; limit?: number; offset?: number }): Promise<SubmissionRow[]> {
    let query = this.db.select().from(vulseFormSubmissions)
      .where(eq(vulseFormSubmissions.formHandle, opts.formHandle))
      .orderBy(desc(vulseFormSubmissions.createdAt))
    if (opts.limit !== undefined) query = query.limit(opts.limit) as typeof query
    if (opts.offset !== undefined) query = query.offset(opts.offset) as typeof query
    const rows = await query
    return rows.map(parseSubmission)
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(vulseFormUniqueValues).where(eq(vulseFormUniqueValues.submissionId, id))
    await this.db.delete(vulseFormSubmissions).where(eq(vulseFormSubmissions.id, id))
  }

  async deleteMany(ids: string[], formHandle?: string): Promise<number> {
    if (ids.length === 0) return 0
    const uniqueIds = [...new Set(ids)]
    let deleted = 0
    for (const id of uniqueIds) {
      const conditions = [eq(vulseFormSubmissions.id, id)]
      if (formHandle !== undefined) conditions.push(eq(vulseFormSubmissions.formHandle, formHandle))
      const row = await this.db.select({ id: vulseFormSubmissions.id })
        .from(vulseFormSubmissions)
        .where(and(...conditions))
        .get()
      if (!row) continue
      await this.db.delete(vulseFormUniqueValues).where(eq(vulseFormUniqueValues.submissionId, id))
      await this.db.delete(vulseFormSubmissions).where(eq(vulseFormSubmissions.id, id))
      deleted++
    }
    return deleted
  }

  async updateStatus(id: string, status: 'processed' | 'failed', error?: string | null): Promise<void> {
    await this.db.update(vulseFormSubmissions).set({
      status,
      error: error ?? null,
    }).where(eq(vulseFormSubmissions.id, id))
  }
}

export interface UploadDraftRow {
  id: string
  formHandle: string
  fieldName: string
  mediaId: string
  expiresAt: Date
  createdAt: Date
}

export class FormUploadDraftsRepo {
  constructor(private db: VulseDb) {}

  async create(input: {
    formHandle: string
    fieldName: string
    mediaId: string
    expiresAt: Date
  }): Promise<UploadDraftRow> {
    const now = new Date()
    const row = {
      id: nanoid(),
      formHandle: input.formHandle,
      fieldName: input.fieldName,
      mediaId: input.mediaId,
      expiresAt: input.expiresAt,
      createdAt: now,
    }
    await this.db.insert(vulseFormUploadDrafts).values(row)
    return row
  }

  async findValid(formHandle: string, fieldName: string, mediaId: string): Promise<UploadDraftRow | null> {
    const row = await this.db.select().from(vulseFormUploadDrafts)
      .where(and(
        eq(vulseFormUploadDrafts.formHandle, formHandle),
        eq(vulseFormUploadDrafts.fieldName, fieldName),
        eq(vulseFormUploadDrafts.mediaId, mediaId),
        gt(vulseFormUploadDrafts.expiresAt, new Date()),
      ))
      .get()
    return row ?? null
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(vulseFormUploadDrafts).where(eq(vulseFormUploadDrafts.id, id))
  }

  async listExpired(before: Date): Promise<UploadDraftRow[]> {
    const rows = await this.db.select().from(vulseFormUploadDrafts)
      .where(lt(vulseFormUploadDrafts.expiresAt, before))
    return rows
  }

  async attachToSubmission(draftId: string): Promise<void> {
    await this.delete(draftId)
  }
}
