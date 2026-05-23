import { sqliteTable, text, integer, index, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

// --- Vulse content ---

export const entries = sqliteTable('vulse_entries', {
  id: text('id').primaryKey(),
  collection: text('collection').notNull(),
  parentId: text('parent_id').references((): AnySQLiteColumn => entries.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  slug: text('slug').notNull(),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  locale: text('locale').notNull().default('default'),
  version: integer('version').notNull().default(1),
  content: text('content', { mode: 'json' }).notNull(),
  draftContent: text('draft_content', { mode: 'json' }),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (t) => ({
  uniqSlug: uniqueIndex('vulse_entries_collection_slug_locale').on(t.collection, t.slug, t.locale),
  byStatus: index('vulse_entries_collection_status_published').on(t.collection, t.status, t.publishedAt),
  byTree: index('vulse_entries_tree').on(t.collection, t.parentId, t.sortOrder),
}))

export const entryRevisions = sqliteTable('vulse_entry_revisions', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content', { mode: 'json' }).notNull(),
  authorId: text('author_id'),
  changeSummary: text('change_summary'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  byEntry: index('vulse_entry_revisions_entry_version').on(t.entryId, t.version),
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
})

export const vulseCollections = sqliteTable('vulse_collections', {
  handle: text('handle').primaryKey(),
  label: text('label').notNull(),
  definition: text('definition', { mode: 'json' }).notNull(),
  blueprintHash: text('blueprint_hash').notNull(),
  singleton: integer('singleton', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const vulseSets = sqliteTable('vulse_sets', {
  handle: text('handle').primaryKey(),
  label: text('label').notNull(),
  definition: text('definition', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const settings = sqliteTable('vulse_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// --- Better Auth (canonical column names per better-auth Drizzle adapter) ---

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role', { enum: ['admin', 'editor', 'member'] }).notNull().default('member'),
  displayName: text('display_name'),
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
