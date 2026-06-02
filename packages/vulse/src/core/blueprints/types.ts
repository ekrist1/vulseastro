import type { z } from 'zod'
import type { BlueprintDefinition, FieldDefinition } from './definition.js'

export type Role = 'admin' | 'editor' | 'member'

export interface AuthContext {
  user: { id: string; role: Role; email: string } | null
}

export interface AccessArgs<T = unknown> extends AuthContext {
  entry?: { id: string; status: 'draft' | 'published'; createdBy: string | null; content: T }
}

export type AccessFn<T = unknown> = (args: AccessArgs<T>) => boolean | Promise<boolean>

import type { SeoFieldMapping } from './seo.js'

export interface AdminConfig {
  titleField: string
  listColumns?: string[]
  /** Maps content fields to SEO defaults in the entry editor. */
  seoMapping?: SeoFieldMapping
}

export interface PreviewConfig {
  /**
   * URL template for the public-facing entry page. `{slug}` is replaced with
   * the entry's URL slug. Defaults to `/{slug}` if omitted.
   * Example: `/recipes/{slug}` or `/blog/{slug}`.
   */
  path: string
  /** DOM selector for live preview morph target. Defaults to `main`. */
  rootSelector?: string
  /** When `false`, hides the live preview split panel (Preview button still works). Defaults to `true`. */
  live?: boolean
}

export interface BlueprintAccess<T = unknown> {
  read?: AccessFn<T>
  create?: AccessFn<T>
  update?: AccessFn<T>
  delete?: AccessFn<T>
}

export interface Blueprint<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  label: string
  schema: S
  admin: AdminConfig
  access?: BlueprintAccess<z.infer<S>>
  preview?: PreviewConfig
  singleton?: boolean
  tree?: boolean
  maxDepth?: number
  drafts?: boolean
  seo?: boolean
  fields?: FieldDefinition[]
  definition?: BlueprintDefinition
}
