import type { LocalStore, NoteSyncState, Task } from "@shungite/core";
import {
  DEFAULT_DATABASE_NAME,
  NOTES_STORE,
  SETTINGS_STORE,
  TASKS_STORE,
  createConnection,
  readAll,
  readRecord,
  writeRecord,
  type IndexedDBOptions,
} from "./indexeddb";

const VAULT_PATH_KEY = "vault_path";

interface SettingRecord {
  key: string;
  value: string | null;
}

export interface IndexedDBLocalStoreOptions extends IndexedDBOptions {
  /**
   * Returned by `getVaultPath` until a path is saved. The web platform passes
   * its virtual Vault root so Promote and Sync work without a real folder.
   */
  vaultPath?: string | null;
}

/** Matches the Tauri SQLite adapter's `ORDER BY created_at, id`. */
function byCreatedAt<T extends { id: string; createdAt: string }>(
  a: T,
  b: T,
): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * `LocalStore` for the web build, backed by IndexedDB. Notes are `path` +
 * `content` records and settings hold the (virtual) Vault path. The PWA is a
 * Satellite, so there is no SQLite file or Vault to provision.
 */
export function createIndexedDBLocalStore(
  options: IndexedDBLocalStoreOptions = {},
): LocalStore {
  const connection = createConnection(
    options.databaseName ?? DEFAULT_DATABASE_NAME,
  );
  const defaultVaultPath = options.vaultPath ?? null;

  async function readSetting(key: string): Promise<SettingRecord | undefined> {
    return readRecord<SettingRecord>(await connection(), SETTINGS_STORE, key);
  }

  async function saveSetting(key: string, value: string | null): Promise<void> {
    await writeRecord(await connection(), SETTINGS_STORE, { key, value });
  }

  function cursorSettingKey(table: string): string {
    return `sync_cursor:${table}`;
  }

  return {
    async getTask(id) {
      return (
        (await readRecord<Task>(await connection(), TASKS_STORE, id)) ?? null
      );
    },

    async getTasks() {
      const tasks = await readAll<Task>(await connection(), TASKS_STORE);
      return tasks.sort(byCreatedAt);
    },

    async saveTask(task) {
      await writeRecord(await connection(), TASKS_STORE, task);
    },

    async getNote(id) {
      return (
        (await readRecord<NoteSyncState>(
          await connection(),
          NOTES_STORE,
          id,
        )) ?? null
      );
    },

    async getNotes() {
      const notes = await readAll<NoteSyncState>(
        await connection(),
        NOTES_STORE,
      );
      return notes.sort(byCreatedAt);
    },

    async saveNote(note) {
      await writeRecord(await connection(), NOTES_STORE, note);
    },

    async getVaultPath() {
      const setting = await readSetting(VAULT_PATH_KEY);
      return setting === undefined ? defaultVaultPath : setting.value;
    },

    async saveVaultPath(path) {
      await saveSetting(VAULT_PATH_KEY, path);
    },

    async getSyncCursor(table) {
      const setting = await readSetting(cursorSettingKey(table));
      return setting === undefined ? null : setting.value;
    },

    async saveSyncCursor(table, cursor) {
      await saveSetting(cursorSettingKey(table), cursor);
    },
  };
}
