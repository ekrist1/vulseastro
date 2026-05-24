<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FieldDescriptor } from '../client/form-from-zod.js'
import type { SeoContent, SeoFieldMapping } from '../../core/blueprints/seo.js'
import {
  resolveEffectiveSeo,
  resolvedSeoSummary,
} from '../../core/blueprints/seo.js'
import TextField from './fields/TextField.vue'
import TextareaField from './fields/TextareaField.vue'
import MediaField from './fields/MediaField.vue'

const props = defineProps<{
  modelValue: SeoContent | undefined
  content: Record<string, unknown>
  fields: FieldDescriptor[]
  titleField?: string
  seoMapping?: SeoFieldMapping
  fieldLabels?: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: SeoContent): void
}>()

const expanded = ref(false)

const seo = computed(() => props.modelValue ?? {})

const resolved = computed(() =>
  resolveEffectiveSeo(
    props.content,
    seo.value,
    props.fields,
    props.titleField ?? 'title',
    props.seoMapping,
  ),
)

const summary = computed(() => resolvedSeoSummary(resolved.value))

function fieldLabel(path: string | undefined): string {
  if (!path) return 'field'
  return props.fieldLabels?.[path] ?? path
}

function sourceHint(key: 'metaTitle' | 'metaDescription' | 'ogImage'): string | null {
  const field = resolved.value[key]
  if (field.overridden || !field.sourceField) return null
  return `Defaults to ${fieldLabel(field.sourceField)}`
}

function update<K extends keyof SeoContent>(key: K, value: SeoContent[K]) {
  emit('update:modelValue', { ...seo.value, [key]: value })
}
</script>

<template>
  <details
    class="rounded border border-zinc-200 bg-zinc-50 text-sm"
    :open="expanded"
    @toggle="expanded = ($event.target as HTMLDetailsElement).open"
  >
    <summary class="cursor-pointer select-none px-3 py-2.5 text-zinc-600">
      <span class="font-medium">SEO</span>
      <span class="ml-2 text-zinc-500">{{ summary }}</span>
    </summary>
    <div class="space-y-4 border-t border-zinc-200 px-3 py-3">
      <p class="text-xs text-zinc-500">
        Leave fields empty to use mapped content fields. Values you enter here override those defaults.
      </p>
      <div>
        <TextField
          label="Meta title"
          :model-value="seo.metaTitle ?? ''"
          @update:modelValue="update('metaTitle', $event || undefined)"
        />
        <p v-if="sourceHint('metaTitle')" class="mt-1 text-xs text-zinc-400">
          {{ sourceHint('metaTitle') }}
          <span v-if="resolved.metaTitle.value && !resolved.metaTitle.overridden" class="text-zinc-500">
            — currently “{{ resolved.metaTitle.value }}”
          </span>
        </p>
      </div>
      <div>
        <TextareaField
          label="Meta description"
          :model-value="seo.metaDescription ?? ''"
          @update:modelValue="update('metaDescription', $event || undefined)"
        />
        <p v-if="sourceHint('metaDescription')" class="mt-1 text-xs text-zinc-400">
          {{ sourceHint('metaDescription') }}
          <span v-if="resolved.metaDescription.value && !resolved.metaDescription.overridden" class="text-zinc-500">
            — currently “{{ resolved.metaDescription.value }}”
          </span>
        </p>
      </div>
      <div>
        <MediaField
          label="OG image"
          :model-value="seo.ogImage ?? resolved.ogImage.value"
          @update:modelValue="update('ogImage', $event ?? undefined)"
        />
        <p v-if="sourceHint('ogImage')" class="mt-1 text-xs text-zinc-400">
          {{ sourceHint('ogImage') }}
          <span v-if="resolved.ogImage.value && !resolved.ogImage.overridden" class="text-zinc-500">
            — using {{ fieldLabel(resolved.ogImage.sourceField) }}
          </span>
        </p>
      </div>
    </div>
  </details>
</template>
