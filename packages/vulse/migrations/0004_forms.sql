CREATE TABLE vulse_forms (
  handle TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  definition TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE vulse_form_submissions (
  id TEXT PRIMARY KEY,
  form_handle TEXT NOT NULL REFERENCES vulse_forms(handle) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  file_refs TEXT NOT NULL DEFAULT '[]',
  meta TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  error TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX vulse_form_submissions_form_created
  ON vulse_form_submissions(form_handle, created_at DESC);
--> statement-breakpoint
CREATE INDEX vulse_form_submissions_form_status
  ON vulse_form_submissions(form_handle, status);
--> statement-breakpoint
CREATE TABLE vulse_form_upload_drafts (
  id TEXT PRIMARY KEY,
  form_handle TEXT NOT NULL REFERENCES vulse_forms(handle) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  media_id TEXT NOT NULL REFERENCES vulse_media(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX vulse_form_upload_drafts_expires
  ON vulse_form_upload_drafts(expires_at);
--> statement-breakpoint
CREATE TABLE vulse_form_unique_values (
  form_handle TEXT NOT NULL REFERENCES vulse_forms(handle) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  value_hash TEXT NOT NULL,
  submission_id TEXT NOT NULL REFERENCES vulse_form_submissions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (form_handle, field_name, value_hash)
);
--> statement-breakpoint
CREATE INDEX vulse_form_unique_values_submission
  ON vulse_form_unique_values(submission_id);
--> statement-breakpoint
CREATE TABLE vulse_form_rate_limits (
  form_handle TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (form_handle, ip_hash, window_start)
);
