import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { FormsRepo, SubmissionsRepo } from '../../src/core/repos/forms'
import { eq } from 'drizzle-orm'
import { vulseFormUniqueValues } from '../../src/core/schema'

const sampleForm = {
  handle: 'contact',
  label: 'Contact',
  fields: [
    { name: 'email', ui: { kind: 'email' as const }, optional: false, validation: { unique: true } },
  ],
  settings: { enabled: true },
  actions: [],
}

describe('forms repos', () => {
  beforeEach(async () => { await applyMigrations(env.DB) })

  it('creates form, submission, lists, deletes with unique cleanup', async () => {
    const db = createDb(env.DB)
    const forms = new FormsRepo(db)
    const subs = new SubmissionsRepo(db)

    await forms.create(sampleForm)
    const listed = await forms.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]!.submissionCount).toBe(0)

    const sub = await subs.create({
      formHandle: 'contact',
      payload: { email: 'a@example.com' },
      meta: { ip: '127.0.0.1' },
    })
    await db.insert(vulseFormUniqueValues).values({
      formHandle: 'contact',
      fieldName: 'email',
      valueHash: 'abc',
      submissionId: sub.id,
      createdAt: new Date(),
    })

    const after = await forms.list()
    expect(after[0]!.submissionCount).toBe(1)

    const rows = await subs.list({ formHandle: 'contact' })
    expect(rows[0]!.id).toBe(sub.id)

    await subs.delete(sub.id)
    const uniqueLeft = await db.select().from(vulseFormUniqueValues)
      .where(eq(vulseFormUniqueValues.submissionId, sub.id))
    expect(uniqueLeft).toHaveLength(0)
  })

  it('bulk deletes only matching submissions and reports actual count', async () => {
    const db = createDb(env.DB)
    const forms = new FormsRepo(db)
    const subs = new SubmissionsRepo(db)

    await forms.create(sampleForm)
    await forms.create({ ...sampleForm, handle: 'newsletter', label: 'Newsletter' })

    const contact = await subs.create({
      formHandle: 'contact',
      payload: { email: 'a@example.com' },
      meta: {},
    })
    const newsletter = await subs.create({
      formHandle: 'newsletter',
      payload: { email: 'b@example.com' },
      meta: {},
    })

    const deleted = await subs.deleteMany([contact.id, newsletter.id, contact.id, 'missing'], 'contact')

    expect(deleted).toBe(1)
    expect(await subs.findById(contact.id)).toBeNull()
    expect(await subs.findById(newsletter.id)).not.toBeNull()
  })
})
