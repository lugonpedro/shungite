import type { LocalStore, NoteSyncState, Task } from "@taskmanager/core";
import Database from "@tauri-apps/plugin-sql";

/** Relative to Tauri's app data directory. */
const DATABASE_URL = "sqlite:taskmanager.db";
const VAULT_PATH_KEY = "vault_path";

const TASK_COLUMNS =
  "id, text, done, due, version, base_version, deleted, created_at, updated_at, note_path";

const NOTE_COLUMNS =
  "id, path, content, version, base_version, deleted, created_at, updated_at";

interface TaskRow {
  id: string;
  text: string;
  done: number;
  due: string | null;
  version: number;
  base_version: number;
  deleted: number;
  created_at: string;
  updated_at: string;
  note_path: string | null;
}

interface NoteRow {
  id: string;
  path: string;
  content: string;
  version: number;
  base_version: number;
  deleted: number;
  created_at: string;
  updated_at: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    text: row.text,
    done: row.done !== 0,
    due: row.due,
    version: row.version,
    baseVersion: row.base_version,
    deleted: row.deleted !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notePath: row.note_path,
  };
}

function toNote(row: NoteRow): NoteSyncState {
  return {
    id: row.id,
    path: row.path,
    content: row.content,
    version: row.version,
    baseVersion: row.base_version,
    deleted: row.deleted !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The app's SQLite `LocalStore`, backed by the official Tauri SQL plugin. */
let localStorePromise: Promise<LocalStore> | null = null;

export function createTauriLocalStore(): Promise<LocalStore> {
  // `Database.load` runs the Rust migrations; opening it twice concurrently
  // (React StrictMode mounts effects twice in dev) can race on a fresh file.
  // One shared connection per app run also keeps the SQLite lock calm.
  localStorePromise ??= openStore().catch((error: unknown) => {
    // Let a later mount retry after a transient failure.
    localStorePromise = null;
    throw error;
  });
  return localStorePromise;
}

async function openStore(): Promise<LocalStore> {
  const db = await Database.load(DATABASE_URL);

  return {
    async getTask(id) {
      const rows = await db.select<TaskRow[]>(
        `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`,
        [id],
      );
      const row = rows[0];
      return row === undefined ? null : toTask(row);
    },

    async getTasks() {
      const rows = await db.select<TaskRow[]>(
        `SELECT ${TASK_COLUMNS} FROM tasks ORDER BY created_at, id`,
      );
      return rows.map(toTask);
    },

    async saveTask(task) {
      await db.execute(
        `INSERT INTO tasks (${TASK_COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT(id) DO UPDATE SET
           text = excluded.text,
           done = excluded.done,
           due = excluded.due,
           version = excluded.version,
           base_version = excluded.base_version,
           deleted = excluded.deleted,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           note_path = excluded.note_path`,
        [
          task.id,
          task.text,
          task.done ? 1 : 0,
          task.due,
          task.version,
          task.baseVersion,
          task.deleted ? 1 : 0,
          task.createdAt,
          task.updatedAt,
          task.notePath,
        ],
      );
    },

    async getNote(id) {
      const rows = await db.select<NoteRow[]>(
        `SELECT ${NOTE_COLUMNS} FROM notes WHERE id = $1`,
        [id],
      );
      const row = rows[0];
      return row === undefined ? null : toNote(row);
    },

    async getNotes() {
      const rows = await db.select<NoteRow[]>(
        `SELECT ${NOTE_COLUMNS} FROM notes ORDER BY created_at, id`,
      );
      return rows.map(toNote);
    },

    async saveNote(note) {
      await db.execute(
        `INSERT INTO notes (${NOTE_COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(id) DO UPDATE SET
           path = excluded.path,
           content = excluded.content,
           version = excluded.version,
           base_version = excluded.base_version,
           deleted = excluded.deleted,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
        [
          note.id,
          note.path,
          note.content,
          note.version,
          note.baseVersion,
          note.deleted ? 1 : 0,
          note.createdAt,
          note.updatedAt,
        ],
      );
    },

    async getVaultPath() {
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = $1",
        [VAULT_PATH_KEY],
      );
      return rows[0]?.value ?? null;
    },

    async saveVaultPath(path) {
      if (path === null) {
        await db.execute("DELETE FROM settings WHERE key = $1", [
          VAULT_PATH_KEY,
        ]);
        return;
      }
      await db.execute(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [VAULT_PATH_KEY, path],
      );
    },
  };
}
