import { describe, it, expect, beforeEach, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { applyMigrations } from '../helpers/apply-migrations'
import { createDb } from '../../src/core/db'
import { FormsRepo } from '../../src/core/repos/forms'
import { formSubmitRoutes } from '../../src/server/routes/form-submit'
import { processSubmission } from '../../src/server/forms/process-submission'
import * as email from '../../src/server/forms/email'
import { definePlugin } from '../../src'
import { __testResetVulsePlugins, setVulsePlugins } from '../../src/server/plugins'

const SECRET = 'a'.repeat(32)

const contactForm = {
  handle: 'contact',
  label: 'Contact',
  fields: [
    { name: 'name', ui: { kind: 'text' as const }, optional: false },
    { name: 'email', ui: { kind: 'email' as const }, optional: false, validation: { unique: true } },
    { name: '_hp', ui: { kind: 'honeypot' as const }, optional: true },
  ],
  settings: { enabled: true, successMessage: 'Thanks!', notifyEmails: ['admin@example.com'] },
  actions: [],
}

async function seedForm() {
  const db = createDb(env.DB)
  await new FormsRepo(db).create(contactForm)
  return db
}

describe('form submit', () => {
  beforeEach(async () => {
    __testResetVulsePlugins()
    await applyMigrations(env.DB)
  })

  it('accepts valid submission', async () => {
    const db = await seedForm()
    const routes = formSubmitRoutes(db)
    const res = await routes.submit(new Request('http://localhost/api/vulse/forms/contact/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ name: 'Ada', email: 'ada@example.com' }),
    }), { handle: 'contact' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: true; data: { message: string } }
    expect(body.data.message).toBe('Thanks!')
  })

  it('honeypot returns fake success without persisting', async () => {
    const db = await seedForm()
    const routes = formSubmitRoutes(db)
    const res = await routes.submit(new Request('http://localhost/api/vulse/forms/contact/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bot', email: 'bot@example.com', _hp: 'filled' }),
    }), { handle: 'contact' })
    expect(res.status).toBe(200)
    const rows = await env.DB.prepare('SELECT COUNT(*) as c FROM vulse_form_submissions').first<{ c: number }>()
    expect(rows?.c).toBe(0)
  })

  it('plugin can drop spam before persisting', async () => {
    setVulsePlugins([
      definePlugin({
        id: 'spam-filter',
        hooks: {
          'form:beforeSubmit': ({ payload }) => {
            if (payload.email === 'bot@example.com') {
              return { action: 'drop', reason: 'spam' }
            }
          },
        },
      }),
    ])
    const db = await seedForm()
    const routes = formSubmitRoutes(db)
    const res = await routes.submit(new Request('http://localhost/api/vulse/forms/contact/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bot', email: 'bot@example.com' }),
    }), { handle: 'contact' })
    expect(res.status).toBe(200)
    const rows = await env.DB.prepare('SELECT COUNT(*) as c FROM vulse_form_submissions').first<{ c: number }>()
    expect(rows?.c).toBe(0)
  })

  it('plugin can mutate payload before validation and storage', async () => {
    setVulsePlugins([
      definePlugin({
        id: 'normalize-form-payload',
        hooks: {
          'form:beforeSubmit': ({ payload }) => ({
            payload: { ...payload, name: String(payload.name ?? '').trim() },
          }),
        },
      }),
    ])
    const db = await seedForm()
    const routes = formSubmitRoutes(db)
    const res = await routes.submit(new Request('http://localhost/api/vulse/forms/contact/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ name: '  Ada  ', email: 'ada@example.com' }),
    }), { handle: 'contact' })
    expect(res.status).toBe(200)
    const row = await env.DB.prepare('SELECT payload FROM vulse_form_submissions LIMIT 1').first<{ payload: string }>()
    expect(JSON.parse(row!.payload).name).toBe('Ada')
  })

  it('rejects duplicate unique email per form', async () => {
    const db = await seedForm()
    const routes = formSubmitRoutes(db)
    const req = (email: string) => routes.submit(new Request('http://localhost/api/vulse/forms/contact/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ name: 'Ada', email }),
    }), { handle: 'contact' })
    await req('dup@example.com')
    const second = await req('dup@example.com')
    expect(second.status).toBe(409)
  })

  it('allows same email on different form', async () => {
    const db = createDb(env.DB)
    const forms = new FormsRepo(db)
    await forms.create(contactForm)
    await forms.create({ ...contactForm, handle: 'newsletter', label: 'Newsletter' })
    const routes = formSubmitRoutes(db)
    const body = JSON.stringify({ name: 'Ada', email: 'shared@example.com' })
    const opts = { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' }, body }
    expect((await routes.submit(new Request('http://localhost/api/vulse/forms/contact/submit', opts), { handle: 'contact' })).status).toBe(200)
    expect((await routes.submit(new Request('http://localhost/api/vulse/forms/newsletter/submit', opts), { handle: 'newsletter' })).status).toBe(200)
  })
})

describe('form process', () => {
  beforeEach(async () => {
    __testResetVulsePlugins()
    await applyMigrations(env.DB)
  })

  it('sends notify email and marks processed', async () => {
    const db = await seedForm()
    const routes = formSubmitRoutes(db)
    const sendSpy = vi.spyOn(email, 'sendFormEmail').mockResolvedValue()
    await routes.submit(new Request('http://localhost/api/vulse/forms/contact/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ name: 'Ada', email: 'ada@example.com' }),
    }), { handle: 'contact' })
    const row = await env.DB.prepare('SELECT id FROM vulse_form_submissions LIMIT 1').first<{ id: string }>()
    await processSubmission({ DB: env.DB, EMAIL_FROM: 'noreply@example.com', SEND_EMAIL: {} as SendEmail }, row!.id)
    expect(sendSpy).toHaveBeenCalled()
    const status = await env.DB.prepare('SELECT status FROM vulse_form_submissions WHERE id = ?').bind(row!.id).first<{ status: string }>()
    expect(status?.status).toBe('processed')
    sendSpy.mockRestore()
  })
})
