import { describe, it, expect } from 'vitest'
import { compileForm } from '../../src/core/forms/compile'
import type { FormDefinition } from '../../src/core/forms/definition'

function baseDef(fields: FormDefinition['fields']): FormDefinition {
  return {
    handle: 'test',
    label: 'Test',
    fields,
    settings: { enabled: true },
    actions: [],
  }
}

describe('compileForm', () => {
  it('excludes submit and honeypot from schema', () => {
    const { schema, inputFields } = compileForm(baseDef([
      { name: 'name', ui: { kind: 'text' }, optional: false },
      { name: '_hp', ui: { kind: 'honeypot' }, optional: true },
      { name: 'go', ui: { kind: 'submit' }, optional: true },
    ]))
    expect(inputFields.map((f) => f.name)).toEqual(['name'])
    expect(schema.safeParse({ name: 'Ada' }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
  })

  it('validates email fields', () => {
    const { schema } = compileForm(baseDef([
      { name: 'email', ui: { kind: 'email' }, optional: false },
    ]))
    expect(schema.safeParse({ email: 'a@b.com' }).success).toBe(true)
    expect(schema.safeParse({ email: 'nope' }).success).toBe(false)
  })

  it('validates file as media id string', () => {
    const { schema } = compileForm(baseDef([
      { name: 'resume', ui: { kind: 'file' }, optional: false },
    ]))
    expect(schema.safeParse({ resume: 'media123' }).success).toBe(true)
    expect(schema.safeParse({ resume: '' }).success).toBe(false)
  })

  it('validates checkbox as boolean', () => {
    const { schema } = compileForm(baseDef([
      { name: 'agree', ui: { kind: 'checkbox' }, optional: false },
    ]))
    expect(schema.safeParse({ agree: true }).success).toBe(true)
    expect(schema.safeParse({ agree: 'yes' }).success).toBe(false)
  })

  it('validates select enum', () => {
    const { schema } = compileForm(baseDef([
      { name: 'size', ui: { kind: 'select', options: ['s', 'm', 'l'] }, optional: false },
    ]))
    expect(schema.safeParse({ size: 'm' }).success).toBe(true)
    expect(schema.safeParse({ size: 'xl' }).success).toBe(false)
  })

  it('collects uniqueFields', () => {
    const { uniqueFields } = compileForm(baseDef([
      { name: 'email', ui: { kind: 'email' }, optional: false, validation: { unique: true } },
      { name: 'name', ui: { kind: 'text' }, optional: false },
    ]))
    expect(uniqueFields).toEqual(['email'])
  })
})
