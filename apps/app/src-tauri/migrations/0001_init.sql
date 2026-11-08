-- Tasks without a Note live here until the user promotes them.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  due TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  base_version INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  note_path TEXT
);

-- App settings that must survive a restart, such as the chosen Vault folder.
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
