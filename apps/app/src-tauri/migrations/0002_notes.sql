-- Note sync metadata. A Note shares its id with the Task it was promoted
-- from; `path` is Vault-relative and `content` is the full `.md` text, kept so
-- Sync can detect changes without depending on a clock.
CREATE TABLE notes (
  id TEXT PRIMARY KEY NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  base_version INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
