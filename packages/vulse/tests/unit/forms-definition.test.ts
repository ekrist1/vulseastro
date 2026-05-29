import { describe, it, expect } from 'vitest'
import { FormDefinitionSchema } from '../../src/core/forms/definition'

const contactForm = {
  handle: 'contact',
  label: 'Contact',
  fields: [
    { name: 'name', label: 'Name', ui: { kind: 'text' as const }, optional: false },
    { name: 'email', label: 'Email', ui: { kind: 'email' as const }, optional: false, validation: { email: true, unique: true } },
    { name: 'message', label: 'Message', ui: { kind: 'textarea' as const }, optional: false },
    { name: '_hp', ui: { kind: 'honeypot' as const }, optional: true },
    { name: 'submit', ui: { kind: 'submit' as const, label: 'Send' }, optional: true },
  ],
  settings: {
    enabled: true,
    successMessage: 'Thanks!',
    notifyEmails: ['admin@example.com'],
  },
  actions: [],
}

describe('FormDefinitionSchema', () => {
  it('parses a valid contact form', () => {
    const parsed = FormDefinitionSchema.parse(contactForm)
    expect(parsed.handle).toBe('contact')
    expect(parsed.fields).toHaveLength(5)
  })

  it('rejects invalid handles', () => {
    expect(() => FormDefinitionSchema.parse({ ...contactForm, handle: 'Contact' })).toThrow()
    expect(() => FormDefinitionSchema.parse({ ...contactForm, handle: '1bad' })).toThrow()
  })

  it('rejects invalid field kinds', () => {
    const bad = {
      ...contactForm,
      fields: [{ name: 'x', ui: { kind: 'not-a-kind' }, optional: false }],
    }
    expect(() => FormDefinitionSchema.parse(bad)).toThrow()
  })

  it('allows forms with no fields', () => {
    const parsed = FormDefinitionSchema.parse({ ...contactForm, fields: [] })
    expect(parsed.fields).toEqual([])
  })

  it('rejects duplicate field names', () => {
    const duplicated = {
      ...contactForm,
      fields: [
        { name: 'email', ui: { kind: 'email' as const }, optional: false },
        { name: 'email', ui: { kind: 'text' as const }, optional: false },
      ],
    }
    expect(() => FormDefinitionSchema.parse(duplicated)).toThrow(/Duplicate field name/)
  })
})
