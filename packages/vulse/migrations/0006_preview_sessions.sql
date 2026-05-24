CREATE TABLE vulse_preview_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_id TEXT,
  collection TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'default',
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX vulse_preview_sessions_expires ON vulse_preview_sessions(expires_at);
--> statement-breakpoint
CREATE INDEX vulse_preview_sessions_user ON vulse_preview_sessions(user_id);
