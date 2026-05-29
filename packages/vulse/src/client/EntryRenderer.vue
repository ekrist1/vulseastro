<script setup lang="ts">
import { computed } from 'vue'
import BlockRenderer from './BlockRenderer.vue'
import type { BlockComponentMap } from './pm-types.js'
import { inferEntryFields, type EntryFieldDescriptor } from './entry-fields.js'

// Generic, schema-driven renderer for a single entry's `content`.
//
// Pass `fields` (a plain descriptor, e.g. from the scaffold or from the
// blueprint registry) for unambiguous rendering. Without it, kinds are inferred
// from value shapes, which cannot tell an `asset` id from a plain string.
//
// Note: relationship / entry / entries / link fields hold ids or id arrays. This
// renderer has no way to fetch the related entries on the client, so it shows the
// raw value. Customize those in the per-collection wrapper.
defineOptions({ name: 'EntryRenderer' })

const props = defineProps<{
  content: Record<string, unknown> | null | undefined
  /** Plain field descriptor; drives kind dispatch when provided. */
  fields?: EntryFieldDescriptor[]
  /** Base URL for media, e.g. '/api/vulse/public/media'. Island-safe (string). */
  mediaBase?: string
  /** Custom block components, passed through to BlockRenderer. */
  components?: BlockComponentMap
  /** Field name rendered as the <h1>. */
  titleField?: string
}>()

const base = computed(() => (props.mediaBase ?? '/api/vulse/public/media').replace(/\/$/, ''))
const mediaUrl = (id: string) => `${base.value}/${id}/file`

const resolved = computed<EntryFieldDescriptor[]>(
  () => props.fields ?? inferEntryFields(props.content),
)

function val(name: string): unknown {
  return (props.content ?? {})[name]
}

function asRows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : []
}

function setFields(
  field: EntryFieldDescriptor,
  setName: unknown,
): EntryFieldDescriptor[] | undefined {
  return field.sets?.find((s) => s.name === setName)?.fields
}

function scalar(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map((v) => scalar(v)).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function columnLabel(col: EntryFieldDescriptor): string {
  return col.label ?? col.name
}
</script>

<template>
  <article class="vulse-entry">
    <h1 v-if="titleField && val(titleField) != null">{{ scalar(val(titleField)) }}</h1>

    <template v-for="f in resolved" :key="f.name">
      <!-- skip the title field; it is rendered above -->
      <template v-if="f.name !== titleField">
        <!-- blocks -->
        <BlockRenderer
          v-if="f.kind === 'blocks'"
          :blocks="(val(f.name) as any)"
          :mediaUrl="mediaUrl"
          :components="components"
        />

        <!-- asset -->
        <img
          v-else-if="f.kind === 'asset' && val(f.name)"
          :src="mediaUrl(String(val(f.name)))"
          :alt="f.label ?? f.name"
          loading="lazy"
          decoding="async"
        />

        <!-- grid: array of row objects -->
        <table v-else-if="f.kind === 'grid'" class="vulse-grid">
          <thead v-if="f.fields?.length">
            <tr>
              <th v-for="col in f.fields" :key="col.name">{{ columnLabel(col) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in asRows(val(f.name))" :key="i">
              <template v-if="f.fields?.length">
                <td v-for="col in f.fields" :key="col.name">{{ scalar(row[col.name]) }}</td>
              </template>
              <td v-else>{{ scalar(row) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- replicator: a section per { set, content } row -->
        <template v-else-if="f.kind === 'replicator'">
          <section
            v-for="(row, i) in asRows(val(f.name))"
            :key="i"
            class="vulse-replicator-item"
            :data-set="String(row.set)"
          >
            <EntryRenderer
              :content="(row.content as Record<string, unknown>)"
              :fields="setFields(f, row.set)"
              :mediaBase="mediaBase"
              :components="components"
            />
          </section>
        </template>

        <!-- scalar fallback: text / textarea / date / boolean / select / relationship / link / ... -->
        <p v-else-if="val(f.name) != null && scalar(val(f.name)) !== ''">{{ scalar(val(f.name)) }}</p>
      </template>
    </template>
  </article>
</template>
