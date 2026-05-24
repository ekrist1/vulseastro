CREATE VIRTUAL TABLE vulse_entries_fts USING fts5(
  entry_id UNINDEXED, collection UNINDEXED, locale UNINDEXED, slug, title, body
);
--> statement-breakpoint
CREATE TRIGGER vulse_entry_locales_fts_insert AFTER INSERT ON vulse_entry_locales BEGIN
  INSERT INTO vulse_entries_fts(entry_id, collection, locale, slug, title, body)
  VALUES (NEW.entry_id, NEW.collection, NEW.locale, NEW.slug,
          json_extract(NEW.content, '$.title'),
          json_extract(NEW.content, '$.body'));
END;
--> statement-breakpoint
CREATE TRIGGER vulse_entry_locales_fts_update AFTER UPDATE OF content, slug ON vulse_entry_locales BEGIN
  DELETE FROM vulse_entries_fts WHERE entry_id = OLD.entry_id AND locale = OLD.locale;
  INSERT INTO vulse_entries_fts(entry_id, collection, locale, slug, title, body)
  VALUES (NEW.entry_id, NEW.collection, NEW.locale, NEW.slug,
          json_extract(NEW.content, '$.title'),
          json_extract(NEW.content, '$.body'));
END;
--> statement-breakpoint
CREATE TRIGGER vulse_entry_locales_fts_delete AFTER DELETE ON vulse_entry_locales BEGIN
  DELETE FROM vulse_entries_fts WHERE entry_id = OLD.entry_id AND locale = OLD.locale;
END;
