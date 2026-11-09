import type { FileStore } from "@taskmanager/core";
import {
  DEFAULT_DATABASE_NAME,
  FILES_STORE,
  createConnection,
  deleteRecord,
  readAll,
  readRecord,
  writeRecord,
  type IndexedDBOptions,
} from "./indexeddb";

const MARKDOWN_EXT = /\.md$/i;

interface FileRecord {
  path: string;
  content: string;
}

/**
 * `FileStore` for the web build: each Note `.md` is an IndexedDB record keyed
 * by its path. Paths are absolute-looking (`/vault/Note.md`) because the core
 * builds them against the virtual Vault root, but nothing touches the disk.
 */
export function createIndexedDBFileStore(
  options: IndexedDBOptions = {},
): FileStore {
  const connection = createConnection(
    options.databaseName ?? DEFAULT_DATABASE_NAME,
  );

  return {
    async read(path) {
      const record = await readRecord<FileRecord>(
        await connection(),
        FILES_STORE,
        path,
      );
      return record?.content ?? null;
    },

    async write(path, content) {
      await writeRecord(await connection(), FILES_STORE, { path, content });
    },

    async remove(path) {
      await deleteRecord(await connection(), FILES_STORE, path);
    },

    async exists(path) {
      return (
        (await readRecord<FileRecord>(await connection(), FILES_STORE, path)) !==
        undefined
      );
    },

    async list(dir) {
      const root = dir.replace(/\/+$/, "");
      const prefix = root === "" ? "" : `${root}/`;
      const files = await readAll<FileRecord>(
        await connection(),
        FILES_STORE,
      );
      return files
        .map((file) => file.path)
        .filter((path) => path.startsWith(prefix) && MARKDOWN_EXT.test(path))
        .sort((a, b) => a.localeCompare(b));
    },
  };
}
