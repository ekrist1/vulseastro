<script setup lang="ts">
import { computed } from 'vue'
import type { LinkValue } from '../../../core/blueprints/definition.js'
import type { FieldDescriptor } from '../../client/form-from-zod'
import TextField from './TextField.vue'
import TextareaField from './TextareaField.vue'
import NumberField from './NumberField.vue'
import BoolField from './BoolField.vue'
import DateField from './DateField.vue'
import EnumField from './EnumField.vue'
import ObjectField from './ObjectField.vue'
import RepeaterField from './RepeaterField.vue'
import ReplicatorField from './ReplicatorField.vue'
import RefField from './RefField.vue'
import EntryField from './EntryField.vue'
import EntriesField from './EntriesField.vue'
import LinkField from './LinkField.vue'
import MediaField from './MediaField.vue'
import BlocksField from './BlocksField.vue'
import GridField from './GridField.vue'

const props = defineProps<{
  field: FieldDescriptor
  modelValue: unknown
  fieldErrors?: Record<string, string>
  tree?: boolean
  linkCollections?: string[]
}>()
defineEmits<{ (e: 'update:modelValue', v: unknown): void }>()

const ownError = computed<string | undefined>(() => props.fieldErrors?.[props.field.path])

const selectOptions = computed(() => {
  if (props.field.selectOptions?.length) return props.field.selectOptions
  return (props.field.options ?? []).map((key) => ({ key, label: key }))
})
</script>
<template>
  <div :class="['vulse-field', ownError && 'vulse-field-error']">
    <TextField v-if="field.widget === 'text'" :model-value="(modelValue as string) ?? ''" :label="field.label ?? field.path" :required="field.required" @update:modelValue="$emit('update:modelValue', $event)" />
    <TextareaField v-else-if="field.widget === 'textarea'" :model-value="(modelValue as string) ?? ''" :label="field.label ?? field.path" :required="field.required" @update:modelValue="$emit('update:modelValue', $event)" />
    <NumberField v-else-if="field.widget === 'number'" :model-value="modelValue as number" :label="field.label ?? field.path" :required="field.required" @update:modelValue="$emit('update:modelValue', $event)" />
    <BoolField v-else-if="field.widget === 'bool'" :model-value="!!modelValue" :label="field.label ?? field.path" @update:modelValue="$emit('update:modelValue', $event)" />
    <DateField v-else-if="field.widget === 'date'" :model-value="modelValue as string | null" :label="field.label ?? field.path" @update:modelValue="$emit('update:modelValue', $event)" />
    <EnumField
      v-else-if="field.widget === 'enum'"
      :model-value="field.selectMultiple ? ((modelValue as string[]) ?? []) : ((modelValue as string) ?? '')"
      :label="field.label ?? field.path"
      :options="selectOptions"
      :multiple="field.selectMultiple"
      :placeholder="field.selectPlaceholder"
      :clearable="field.selectClearable"
      :required="field.required"
      @update:modelValue="$emit('update:modelValue', $event)"
    />
    <RefField v-else-if="field.widget === 'ref'" :model-value="modelValue as string | null" :label="field.label ?? field.path" :ref-target="field.refTarget!" @update:modelValue="$emit('update:modelValue', $event)" />
    <EntryField v-else-if="field.widget === 'entry'" :model-value="modelValue as string | null" :label="field.label ?? field.path" :collections="field.entryCollections ?? []" @update:modelValue="$emit('update:modelValue', $event)" />
    <EntriesField v-else-if="field.widget === 'entries'" :model-value="(modelValue as string[]) ?? []" :label="field.label ?? field.path" :collections="field.entriesCollections ?? []" :max="field.entriesMax" @update:modelValue="$emit('update:modelValue', $event)" />
    <LinkField
      v-else-if="field.widget === 'link'"
      :model-value="modelValue as LinkValue | null"
      :label="field.label ?? field.path"
      :collections="field.linkCollections"
      :tree="tree"
      @update:modelValue="$emit('update:modelValue', $event)"
    />
    <MediaField v-else-if="field.widget === 'media'" :model-value="modelValue" :label="field.label ?? field.path" @update:modelValue="$emit('update:modelValue', $event)" />
    <BlocksField v-else-if="field.widget === 'blocks'" :model-value="modelValue" :label="field.label ?? field.path" :blocks-sets="field.blocksSets" @update:modelValue="$emit('update:modelValue', $event)" />
    <ObjectField v-else-if="field.widget === 'object'" :model-value="(modelValue as Record<string, unknown>) ?? {}" :label="field.label ?? field.path" :fields="field.children ?? []" @update:modelValue="$emit('update:modelValue', $event)" />
    <ReplicatorField v-else-if="field.widget === 'replicator'" :model-value="modelValue" :label="field.label ?? field.path" :replicator-sets="field.replicatorSets" @update:modelValue="$emit('update:modelValue', $event)" />
    <RepeaterField v-else-if="field.widget === 'repeater'" :model-value="(modelValue as Record<string, unknown>[]) ?? []" :label="field.label ?? field.path" :item-fields="field.itemFields ?? []" @update:modelValue="$emit('update:modelValue', $event)" />
    <GridField
      v-else-if="field.widget === 'grid'"
      :model-value="(modelValue as Record<string, unknown>[]) ?? []"
      :label="field.label ?? field.path"
      :item-fields="field.itemFields ?? []"
      :mode="field.gridMode"
      :min-rows="field.gridMinRows"
      :max-rows="field.gridMaxRows"
      :add-label="field.gridAddLabel"
      :tree="tree"
      :link-collections="linkCollections"
      @update:modelValue="$emit('update:modelValue', $event)"
    />
    <p v-if="ownError" class="mt-1 text-xs text-red-600">{{ ownError }}</p>
  </div>
</template>
