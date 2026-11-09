/**
 * Shared plumbing for the web build's IndexedDB stores. The PWA is always a
 * Satellite (see ADR 0002): Tasks, Notes and their `.md` contents live in the
 * browser, behind the same `LocalStore` and `FileStore` interfaces the Tauri
 * build uses.
 */

export const DEFAULT_DATABASE_NAME = "taskmanager";
export const DATABASE_VERSION = 1;

export const TASKS_STORE = "tasks";
export const NOTES_STORE = "notes";
export const SETTINGS_STORE = "settings";
export const FILES_STORE = "files";

/** Object stores keyed by their record's primary key. */
const STORE_KEYS = {
  [TASKS_STORE]: "id",
  [NOTES_STORE]: "id",
  [SETTINGS_STORE]: "key",
  [FILES_STORE]: "path",
} as const;

export type StoreName = keyof typeof STORE_KEYS;

/**
 * The virtual root the core resolves Note paths against on the web. There is
 * no real Vault folder in the browser, but the core still works with absolute
 * paths, so a Note's file path becomes e.g. `/vault/My note.md` while its
 * synced `NoteSyncState.path` stays Vault-relative (`My note.md`).
 */
export const WEB_VAULT_PATH = "/vault";

export interface IndexedDBOptions {
  /** Defaults to `taskmanager`; tests open isolated databases instead. */
  databaseName?: string;
}

export function openTaskManagerDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [storeName, keyPath] of Object.entries(STORE_KEYS)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open IndexedDB."));
    request.onblocked = () =>
      reject(new Error(`IndexedDB database "${name}" is blocked.`));
  });
}

/**
 * A lazy, shared connection per store instance. Opening on first use keeps the
 * module importable while `indexedDB` is still unavailable (e.g. tests that
 * install `fake-indexeddb` after the import).
 */
export function createConnection(name: string): () => Promise<IDBDatabase> {
  let connection: Promise<IDBDatabase> | null = null;
  return () => {
    connection ??= openTaskManagerDatabase(name).catch((error: unknown) => {
      // Let a later call retry after a transient failure.
      connection = null;
      throw error;
    });
    return connection;
  };
}

export function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export function transactionAsPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export async function readRecord<T>(
  db: IDBDatabase,
  storeName: StoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  const transaction = db.transaction(storeName, "readonly");
  const done = transactionAsPromise(transaction);
  void done.catch(() => {});
  const request = transaction.objectStore(storeName).get(key) as IDBRequest<
    T | undefined
  >;
  const record = await requestAsPromise(request);
  await done;
  return record;
}

export async function readAll<T>(
  db: IDBDatabase,
  storeName: StoreName,
): Promise<T[]> {
  const transaction = db.transaction(storeName, "readonly");
  const done = transactionAsPromise(transaction);
  void done.catch(() => {});
  const request = transaction.objectStore(storeName).getAll() as IDBRequest<T[]>;
  const records = await requestAsPromise(request);
  await done;
  return records;
}

export async function writeRecord<T>(
  db: IDBDatabase,
  storeName: StoreName,
  value: T,
): Promise<void> {
  const transaction = db.transaction(storeName, "readwrite");
  const done = transactionAsPromise(transaction);
  // The request can reject before `done` is awaited; keep it handled.
  void done.catch(() => {});
  const request = transaction.objectStore(storeName).put(value);
  await requestAsPromise(request);
  await done;
}

export async function deleteRecord(
  db: IDBDatabase,
  storeName: StoreName,
  key: IDBValidKey,
): Promise<void> {
  const transaction = db.transaction(storeName, "readwrite");
  const done = transactionAsPromise(transaction);
  void done.catch(() => {});
  const request = transaction.objectStore(storeName).delete(key);
  await requestAsPromise(request);
  await done;
}
