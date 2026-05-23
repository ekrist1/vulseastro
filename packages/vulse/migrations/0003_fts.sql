CREATE VIRTUAL TABLE vulse_entries_fts USING fts5(
  entry_id UNINDEXED, collection UNINDEXED, slug, title, body
);
--> statement-breakpoint
CREATE TRIGGER vulse_entries_fts_insert AFTER INSERT ON vulse_entries BEGIN
  INSERT INTO vulse_entries_fts(entry_id, collection, slug, title, body)
  VALUES (NEW.id, NEW.collection, NEW.slug, json_extract(NEW.content, '$.title'), json_extract(NEW.content, '$.body'));
END;
--> statement-breakpoint
CREATE TRIGGER vulse_entries_fts_update AFTER UPDATE OF content, slug ON vulse_entries BEGIN
  DELETE FROM vulse_entries_fts WHERE entry_id = OLD.id;
  INSERT INTO vulse_entries_fts(entry_id, collection, slug, title, body)
  VALUES (NEW.id, NEW.collection, NEW.slug, json_extract(NEW.content, '$.title'), json_extract(NEW.content, '$.body'));
END;
--> statement-breakpoint
CREATE TRIGGER vulse_entries_fts_delete AFTER DELETE ON vulse_entries BEGIN
  DELETE FROM vulse_entries_fts WHERE entry_id = OLD.id;
END;
