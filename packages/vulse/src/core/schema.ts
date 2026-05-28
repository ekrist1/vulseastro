import { sqliteTable, text, integer, index, uniqueIndex, primaryKey, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// --- Vulse content (i18n model) ---
//
// `vulse_entries` is the single-identity shell: one row per logical entry, holding
// only locale-independent data (tree position, ownership). Per-locale data
// (slug, status, content, drafts) lives in `vulse_entry_locales`, keyed by
// (entry_id, locale). Slug uniqueness is per (collection, locale).

export const entries = sqliteTable('vulse_entries', {
  id: text('id').primaryKey(),
  collection: text('collection').notNull(),
  parentId: text('parent_id').references((): AnySQLiteColumn => entries.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  createdBy: text('created_by'),
}, (t) => ({
  byCollection: index('vulse_entries_collection').on(t.collection),
  byTree: index('vulse_entries_tree').on(t.collection, t.parentId, t.sortOrder),
}))

export const entryLocales = sqliteTable('vulse_entry_locales', {
  entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  collection: text('collection').notNull(),
  locale: text('locale').notNull(),
  slug: text('slug').notNull(),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  version: integer('version').notNull().default(1),
  content: text('content', { mode: 'json' }).notNull(),
  draftContent: text('draft_content', { mode: 'json' }),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  updatedBy: text('updated_by'),
}, (t) => ({
  pk: primaryKey({ columns: [t.entryId, t.locale] }),
  uniqSlug: uniqueIndex('vulse_entry_locales_collection_locale_slug').on(t.collection, t.locale, t.slug),
  byStatus: index('vulse_entry_locales_status_published').on(t.collection, t.locale, t.status, t.publishedAt),
}))

export const entryRevisions = sqliteTable('vulse_entry_revisions', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  locale: text('locale').notNull(),
  version: integer('version').notNull(),
  content: text('content', { mode: 'json' }).notNull(),
  authorId: text('author_id'),
  changeSummary: text('change_summary'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  byEntry: index('vulse_entry_revisions_entry_locale_version').on(t.entryId, t.locale, t.version),
}))

export const media = sqliteTable('vulse_media', {
  id: text('id').primaryKey(),
  r2Key: text('r2_key').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  alt: text('alt'),
  blurhash: text('blurhash'),
  uploadedBy: text('uploaded_by'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
}, (t) => ({
  // Partial index on active rows: every list query reads `WHERE deleted_at IS NULL`.
  active: index('vulse_media_active').on(t.createdAt).where(sql`${t.deletedAt} IS NULL`),
}))

export const vulseCollections = sqliteTable('vulse_collections', {
  handle: text('handle').primaryKey(),
  label: text('label').notNull(),
  definition: text('definition', { mode: 'json' }).notNull(),
  blueprintHash: text('blueprint_hash').notNull(),
  // `schema_version` lets future definition-shape changes migrate row-by-row
  // without a destructive table rewrite.
  schemaVersion: integer('schema_version').notNull().default(1),
  singleton: integer('singleton', { mode: 'boolean' }).notNull().default(false),
  tree: integer('tree', { mode: 'boolean' }).notNull().default(false),
  drafts: integer('drafts', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const vulseSets = sqliteTable('vulse_sets', {
  handle: text('handle').primaryKey(),
  label: text('label').notNull(),
  definition: text('definition', { mode: 'json' }).notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const settings = sqliteTable('vulse_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// --- Redirects ---
//
// One row per managed URL redirect. `from_path` is the incoming pathname
// (case-insensitive lookup via lower-cased unique index); `to_url` is either
// an absolute URL or a site-relative path. The request middleware consults
// this table for non-admin, non-API, non-asset paths.

export const vulseRedirects = sqliteTable('vulse_redirects', {
  id: text('id').primaryKey(),
  fromPath: text('from_path').notNull(),
  toUrl: text('to_url').notNull(),
  status: integer('status').notNull().default(301),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  hits: integer('hits').notNull().default(0),
  lastHitAt: integer('last_hit_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  createdBy: text('created_by'),
}, (t) => ({
  uniqFrom: uniqueIndex('vulse_redirects_from_path').on(t.fromPath),
}))

// --- Forms ---

export const vulseForms = sqliteTable('vulse_forms', {
  handle: text('handle').primaryKey(),
  label: text('label').notNull(),
  definition: text('definition', { mode: 'json' }).notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const vulseFormSubmissions = sqliteTable('vulse_form_submissions', {
  id: text('id').primaryKey(),
  formHandle: text('form_handle').notNull().references(() => vulseForms.handle, { onDelete: 'cascade' }),
  payload: text('payload', { mode: 'json' }).notNull(),
  fileRefs: text('file_refs', { mode: 'json' }).notNull().default([]),
  meta: text('meta', { mode: 'json' }).notNull(),
  status: text('status', { enum: ['received', 'processed', 'failed'] }).notNull().default('received'),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  byFormCreated: index('vulse_form_submissions_form_created').on(t.formHandle, t.createdAt),
  byFormStatus: index('vulse_form_submissions_form_status').on(t.formHandle, t.status),
}))

export const vulseFormUploadDrafts = sqliteTable('vulse_form_upload_drafts', {
  id: text('id').primaryKey(),
  formHandle: text('form_handle').notNull().references(() => vulseForms.handle, { onDelete: 'cascade' }),
  fieldName: text('field_name').notNull(),
  mediaId: text('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  byExpires: index('vulse_form_upload_drafts_expires').on(t.expiresAt),
}))

export const vulseFormUniqueValues = sqliteTable('vulse_form_unique_values', {
  formHandle: text('form_handle').notNull().references(() => vulseForms.handle, { onDelete: 'cascade' }),
  fieldName: text('field_name').notNull(),
  valueHash: text('value_hash').notNull(),
  submissionId: text('submission_id').notNull().references(() => vulseFormSubmissions.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  pk: uniqueIndex('vulse_form_unique_values_pk').on(t.formHandle, t.fieldName, t.valueHash),
  bySubmission: index('vulse_form_unique_values_submission').on(t.submissionId),
}))

export const vulseFormRateLimits = sqliteTable('vulse_form_rate_limits', {
  formHandle: text('form_handle').notNull(),
  ipHash: text('ip_hash').notNull(),
  windowStart: integer('window_start', { mode: 'timestamp_ms' }).notNull(),
  count: integer('count').notNull().default(1),
}, (t) => ({
  pk: uniqueIndex('vulse_form_rate_limits_pk').on(t.formHandle, t.ipHash, t.windowStart),
}))

// --- Globals ---

export const vulseGlobalSets = sqliteTable('vulse_global_sets', {
  handle: text('handle').primaryKey(),
  label: text('label').notNull(),
  definition: text('definition', { mode: 'json' }).notNull(),
  blueprintHash: text('blueprint_hash').notNull().default(''),
  schemaVersion: integer('schema_version').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const vulseGlobalValues = sqliteTable('vulse_global_values', {
  handle: text('handle').primaryKey().references(() => vulseGlobalSets.handle, { onDelete: 'cascade' }),
  content: text('content', { mode: 'json' }).notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// --- Live preview ---

export const vulsePreviewSessions = sqliteTable('vulse_preview_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  entryId: text('entry_id'),
  collection: text('collection').notNull(),
  locale: text('locale').notNull().default('default'),
  slug: text('slug').notNull(),
  content: text('content', { mode: 'json' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  byExpires: index('vulse_preview_sessions_expires').on(t.expiresAt),
  byUser: index('vulse_preview_sessions_user').on(t.userId),
}))

// --- Better Auth (canonical column names per better-auth Drizzle adapter) ---

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role', { enum: ['admin', 'editor', 'member'] }).notNull().default('member'),
  displayName: text('display_name'),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// Better Auth two-factor plugin model. Stores the per-user TOTP secret and
// encrypted backup codes. `verified` flips to true once the user confirms
// their authenticator app produces the right code, at which point
// `user.two_factor_enabled` is also flipped on by the plugin.
export const twoFactor = sqliteTable('twoFactor', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(true),
}, (t) => ({
  byUser: index('two_factor_user_id').on(t.userId),
  bySecret: index('two_factor_secret').on(t.secret),
}))
