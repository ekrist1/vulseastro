import type { z } from 'astro/zod'
import type { FieldDescriptor } from './reflect-fields.js'
import type { Blueprint } from './types.js'
import type { BlueprintDefinition, FieldDefinition, FieldUi, NestedFieldDefinition } from './definition.js'
import { reflectFields } from './reflect-fields.js'

export function blueprintToDefinition(bp: Blueprint): BlueprintDefinition {
  const fields = reflectFields(bp.schema as z.ZodObject<z.ZodRawShape>).map((fd) => descriptorToField(fd))
  return {
    handle: bp.name,
    label: bp.label,
    singleton: bp.singleton ?? false,
    fields,
  }
}

function descriptorToField(fd: FieldDescriptor): FieldDefinition {
  const ui = widgetToUi(fd)
  return {
    name: fd.path,
    label: fd.path,
    ui,
    optional: !fd.required,
  }
}

function widgetToUi(fd: FieldDescriptor): FieldUi {
  switch (fd.widget) {
    case 'textarea':
      return { kind: 'textarea' }
    case 'bool':
      return { kind: 'boolean' }
    case 'date':
      return { kind: 'date' }
    case 'enum':
      return { kind: 'select', options: fd.options ?? [''] }
    case 'ref':
      return { kind: 'relationship', to: fd.refTarget ?? 'unknown' }
    case 'media':
      return { kind: 'asset' }
    case 'blocks': {
      const sets = parseBlocksSets(fd.description)
      return sets.length ? { kind: 'blocks', sets } : { kind: 'blocks' }
    }
    default:
      return { kind: 'text' }
  }
}

function parseBlocksSets(description?: string): string[] {
  if (!description?.startsWith('vulse:blocks:')) return []
  return description.slice('vulse:blocks:'.length).split(',').filter(Boolean)
}

export function nestedFieldToDescriptor(f: NestedFieldDefinition): FieldDescriptor {
  const ui = f.ui
  const base = { path: f.name, required: !f.optional }
  switch (ui.kind) {
    case 'textarea':
      return { ...base, widget: 'textarea' }
    case 'boolean':
      return { ...base, widget: 'bool' }
    case 'date':
      return { ...base, widget: 'date' }
    case 'select':
      return { ...base, widget: 'enum', options: ui.options }
    case 'relationship':
      return { ...base, widget: 'ref', refTarget: ui.to }
    case 'asset':
      return { ...base, widget: 'media' }
    case 'blocks': {
      const tag = ui.sets?.length ? `vulse:blocks:${ui.sets.join(',')}` : 'vulse:blocks'
      return {
        ...base,
        widget: 'blocks',
        description: tag,
        ...(ui.sets?.length ? { blocksSets: ui.sets } : {}),
      }
    }
    default:
      return { ...base, widget: 'text' }
  }
}
