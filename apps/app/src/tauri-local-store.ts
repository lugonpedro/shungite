import type { LocalStore, Task } from "@taskmanager/core";
import Database from "@tauri-apps/plugin-sql";

/** Relative to Tauri's app data directory. */
const DATABASE_URL = "sqlite:taskmanager.db";
const VAULT_PATH_KEY = "vault_path";

const TASK_COLUMNS =
  "id, text, done, due, version, base_version, deleted, created_at, updated_at, note_path";

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

/** The app's SQLite `LocalStore`, backed by the official Tauri SQL plugin. */
export async function createTauriLocalStore(): Promise<LocalStore> {
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
