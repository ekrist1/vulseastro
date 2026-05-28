ALTER TABLE user ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE twoFactor (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE INDEX two_factor_user_id ON twoFactor(user_id);
--> statement-breakpoint
CREATE INDEX two_factor_secret ON twoFactor(secret);
