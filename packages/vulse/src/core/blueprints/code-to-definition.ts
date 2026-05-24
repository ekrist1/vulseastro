import type { z } from 'astro/zod'
import type { FieldDescriptor } from './reflect-fields.js'
import type { Blueprint } from './types.js'
import type { BlueprintDefinition, FieldDefinition, FieldUi, NestedFieldDefinition } from './definition.js'
import { defaultPreviewPath } from './preview-path.js'
import { reflectFields } from './reflect-fields.js'

export function blueprintToDefinition(bp: Blueprint): BlueprintDefinition {
  const fields = reflectFields(bp.schema as z.ZodObject<z.ZodRawShape>).map((fd) => descriptorToField(fd))
  const previewPath = bp.preview?.path ?? defaultPreviewPath(bp.name)
  return {
    handle: bp.name,
    label: bp.label,
    singleton: bp.singleton ?? false,
    ...(bp.seo ? { seo: true } : {}),
    ...(bp.drafts ? { drafts: true } : {}),
    ...(bp.tree ? { tree: true } : {}),
    ...(bp.maxDepth !== undefined ? { maxDepth: bp.maxDepth } : {}),
    ...(bp.admin.seoMapping ? { seoMapping: bp.admin.seoMapping } : {}),
    preview: {
      path: previewPath,
      ...(bp.preview?.rootSelector ? { rootSelector: bp.preview.rootSelector } : {}),
      ...(bp.preview?.live === false ? { live: false } : {}),
    },
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
      return {
        kind: 'select',
        options: fd.selectOptions ?? fd.options?.map((o) => o) ?? [''],
        ...(fd.selectMultiple ? { multiple: true } : {}),
        ...(fd.selectPlaceholder ? { placeholder: fd.selectPlaceholder } : {}),
        ...(fd.selectClearable ? { clearable: true } : {}),
      }
    case 'ref':
      return { kind: 'relationship', to: fd.refTarget ?? 'unknown' }
    case 'entry':
      return { kind: 'entry', collections: fd.entryCollections ?? ['unknown'] }
    case 'entries':
      return {
        kind: 'entries',
        collections: fd.entriesCollections ?? ['unknown'],
        ...(fd.entriesMax !== undefined ? { max: fd.entriesMax } : {}),
      }
    case 'link':
      return {
        kind: 'link',
        ...(fd.linkCollections?.length ? { collections: fd.linkCollections } : {}),
      }
    case 'media':
      return { kind: 'asset' }
    case 'blocks': {
      const sets = parseBlocksSets(fd.description)
      return sets.length ? { kind: 'blocks', sets } : { kind: 'blocks' }
    }
    case 'grid':
      return {
        kind: 'grid',
        fields: (fd.itemFields ?? []).map(descriptorToNestedField),
        ...(fd.gridMode !== undefined ? { mode: fd.gridMode } : {}),
        ...(fd.gridMinRows !== undefined ? { minRows: fd.gridMinRows } : {}),
        ...(fd.gridMaxRows !== undefined ? { maxRows: fd.gridMaxRows } : {}),
        ...(fd.gridAddLabel !== undefined ? { addLabel: fd.gridAddLabel } : {}),
      }
    default:
      return { kind: 'text' }
  }
}

function descriptorToNestedField(fd: FieldDescriptor): NestedFieldDefinition {
  const ui = widgetToUi(fd) as NestedFieldDefinition['ui']
  return {
    name: fd.path,
    label: fd.label,
    ui,
    optional: !fd.required,
  }
}

function parseBlocksSets(description?: string): string[] {
  if (!description?.startsWith('vulse:blocks:')) return []
  return description.slice('vulse:blocks:'.length).split(',').filter(Boolean)
}

export function nestedFieldToDescriptor(f: NestedFieldDefinition): FieldDescriptor {
  const ui = f.ui
  const base = { path: f.name, required: !f.optional, label: f.label ?? f.name }
  switch (ui.kind) {
    case 'textarea':
      return { ...base, widget: 'textarea' }
    case 'boolean':
      return { ...base, widget: 'bool' }
    case 'date':
      return { ...base, widget: 'date' }
    case 'select':
      return {
        ...base,
        widget: 'enum',
        options: ui.options.map((o) => (typeof o === 'string' ? o : o.key)),
        selectOptions: ui.options.map((o) => (typeof o === 'string' ? { key: o, label: o } : o)),
        ...(ui.multiple !== undefined ? { selectMultiple: ui.multiple } : {}),
        ...(ui.placeholder !== undefined ? { selectPlaceholder: ui.placeholder } : {}),
        ...(ui.clearable !== undefined ? { selectClearable: ui.clearable } : {}),
      }
    case 'relationship':
      return { ...base, widget: 'ref', refTarget: ui.to }
    case 'entry':
      return { ...base, widget: 'entry', entryCollections: ui.collections }
    case 'entries':
      return {
        ...base,
        widget: 'entries',
        entriesCollections: ui.collections,
        ...(ui.max !== undefined ? { entriesMax: ui.max } : {}),
      }
    case 'link':
      return {
        ...base,
        widget: 'link',
        ...(ui.collections !== undefined ? { linkCollections: ui.collections } : {}),
      }
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
