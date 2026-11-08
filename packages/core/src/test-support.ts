import type {
  FileStore,
  LocalStore,
  Task,
} from "./types";
import type {
  RemoteDevice,
  RemoteNote,
  RemoteStore,
  RemoteTask,
} from "./remote-store";

export type MemoryLocalStore = LocalStore & {
  tasks: Map<string, Task>;
  vaultPath: string | null;
};

/** In-memory `LocalStore`, shared by the core tests. */
export function createMemoryLocalStore(): MemoryLocalStore {
  const tasks = new Map<string, Task>();
  const store: MemoryLocalStore = {
    tasks,
    vaultPath: null,
    async getTask(id) {
      return tasks.get(id) ?? null;
    },
    async getTasks() {
      return [...tasks.values()];
    },
    async saveTask(task) {
      tasks.set(task.id, { ...task });
    },
    async getVaultPath() {
      return store.vaultPath;
    },
    async saveVaultPath(path) {
      store.vaultPath = path;
    },
  };
  return store;
}

export type MemoryFileStore = FileStore & { files: Map<string, string> };

/** In-memory `FileStore`, shared by the core tests. */
export function createMemoryFileStore(): MemoryFileStore {
  const files = new Map<string, string>();
  return {
    files,
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, content) {
      files.set(path, content);
    },
    async remove(path) {
      files.delete(path);
    },
    async exists(path) {
      return files.has(path);
    },
    async list(dir) {
      const prefix = `${dir.replace(/\/+$/, "")}/`;
      return [...files.keys()].filter(
        (path) => path === dir || path.startsWith(prefix),
      );
    },
  };
}

export type MemoryRemoteStore = RemoteStore & {
  tasks: Map<string, RemoteTask>;
  notes: Map<string, RemoteNote>;
  devices: Map<string, RemoteDevice>;
};

/** In-memory `RemoteStore` shared by the Home and Satellite core instances. */
export function createMemoryRemoteStore(): MemoryRemoteStore {
  const tasks = new Map<string, RemoteTask>();
  const notes = new Map<string, RemoteNote>();
  const devices = new Map<string, RemoteDevice>();
  return {
    tasks,
    notes,
    devices,
    async listTasks() {
      return [...tasks.values()];
    },
    async upsertTask(task) {
      tasks.set(task.id, { ...task });
    },
    async listNotes() {
      return [...notes.values()];
    },
    async upsertNote(note) {
      notes.set(note.id, { ...note });
    },
    async listDevices() {
      return [...devices.values()];
    },
    async registerDevice(device) {
      devices.set(device.id, { ...device });
    },
  };
}
