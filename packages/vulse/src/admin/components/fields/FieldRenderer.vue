<script setup lang="ts">
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
import MediaField from './MediaField.vue'
import BlocksField from './BlocksField.vue'

defineProps<{ field: FieldDescriptor; modelValue: unknown }>()
defineEmits<{ (e: 'update:modelValue', v: unknown): void }>()
</script>
<template>
  <TextField v-if="field.widget === 'text'" :model-value="(modelValue as string) ?? ''" :label="field.label ?? field.path" :required="field.required" @update:modelValue="$emit('update:modelValue', $event)" />
  <TextareaField v-else-if="field.widget === 'textarea'" :model-value="(modelValue as string) ?? ''" :label="field.label ?? field.path" :required="field.required" @update:modelValue="$emit('update:modelValue', $event)" />
  <NumberField v-else-if="field.widget === 'number'" :model-value="modelValue as number" :label="field.label ?? field.path" :required="field.required" @update:modelValue="$emit('update:modelValue', $event)" />
  <BoolField v-else-if="field.widget === 'bool'" :model-value="!!modelValue" :label="field.label ?? field.path" @update:modelValue="$emit('update:modelValue', $event)" />
  <DateField v-else-if="field.widget === 'date'" :model-value="modelValue as string | null" :label="field.label ?? field.path" @update:modelValue="$emit('update:modelValue', $event)" />
  <EnumField v-else-if="field.widget === 'enum'" :model-value="modelValue as string" :label="field.label ?? field.path" :options="field.options ?? []" @update:modelValue="$emit('update:modelValue', $event)" />
  <RefField v-else-if="field.widget === 'ref'" :model-value="modelValue as string | null" :label="field.label ?? field.path" :ref-target="field.refTarget!" @update:modelValue="$emit('update:modelValue', $event)" />
  <MediaField v-else-if="field.widget === 'media'" :model-value="modelValue" :label="field.label ?? field.path" @update:modelValue="$emit('update:modelValue', $event)" />
  <BlocksField v-else-if="field.widget === 'blocks'" :model-value="modelValue" :label="field.label ?? field.path" :blocks-sets="field.blocksSets" @update:modelValue="$emit('update:modelValue', $event)" />
  <ObjectField v-else-if="field.widget === 'object'" :model-value="(modelValue as Record<string, unknown>) ?? {}" :label="field.label ?? field.path" :fields="field.children ?? []" @update:modelValue="$emit('update:modelValue', $event)" />
  <ReplicatorField v-else-if="field.widget === 'replicator'" :model-value="modelValue" :label="field.label ?? field.path" :replicator-sets="field.replicatorSets" @update:modelValue="$emit('update:modelValue', $event)" />
  <RepeaterField v-else-if="field.widget === 'repeater'" :model-value="(modelValue as Record<string, unknown>[]) ?? []" :label="field.label ?? field.path" :item-fields="field.itemFields ?? []" @update:modelValue="$emit('update:modelValue', $event)" />
</template>
