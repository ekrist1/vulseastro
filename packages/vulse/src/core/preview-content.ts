export interface VulseLivePreviewLocals {
  entryId: string | null
  collection: string
  slug: string
  content: unknown
}

export interface PreviewLocals {
  vulseLivePreview?: VulseLivePreviewLocals | null
  vulsePreview?: boolean
}

export function resolvePreviewContent(
  entry: { id: string; content: unknown; draftContent?: unknown | null } | null,
  locals: PreviewLocals,
): unknown | null {
  const live = locals.vulseLivePreview
  if (live && entry && live.entryId === entry.id) return live.content
  if (locals.vulsePreview && entry?.draftContent != null) return entry.draftContent
  return entry?.content ?? null
}
