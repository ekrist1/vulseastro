<script setup lang="ts">
import { ref } from 'vue'
import type { FieldDescriptor } from '../client/form-from-zod.js'
import EntryForm from './EntryForm.vue'
import LivePreviewPanel from './LivePreviewPanel.vue'

const props = defineProps<{
  collection: string
  entryId?: string
  fields: FieldDescriptor[]
  initial: Record<string, unknown>
  titleField?: string
  draftsEnabled?: boolean
  tree?: boolean
  parentId?: string | null
  hasUnpublishedChanges?: boolean
  previewPath: string
  enabled?: boolean
}>()

const previewContent = ref<Record<string, unknown>>({ ...props.initial })
delete previewContent.value.slug
delete previewContent.value.status
delete previewContent.value.hasUnpublishedChanges

const previewSlug = ref(String(props.initial?.slug ?? ''))

function onPreviewChange(payload: { content: Record<string, unknown>; slug: string }) {
  previewContent.value = payload.content
  previewSlug.value = payload.slug
}
</script>

<template>
  <div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
    <EntryForm
      :collection="collection"
      :entry-id="entryId"
      :fields="fields"
      :initial="initial"
      :title-field="titleField"
      :drafts-enabled="draftsEnabled"
      :tree="tree"
      :parent-id="parentId"
      :has-unpublished-changes="hasUnpublishedChanges"
      @preview-change="onPreviewChange"
    />
    <LivePreviewPanel
      :collection="collection"
      :entry-id="entryId"
      :preview-path="previewPath"
      :enabled="enabled"
      :slug="previewSlug"
      :content="previewContent"
    />
  </div>
</template>
