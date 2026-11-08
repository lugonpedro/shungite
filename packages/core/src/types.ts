import type { DeviceInfo, RemoteStore } from "./remote-store";

/** A Task. It exists in the local store even when it has no Note. */
export interface Task {
  id: string;
  text: string;
  done: boolean;
  /** Due day in `YYYY-MM-DD`, or null when the Task has no due date. */
  due: string | null;
  version: number;
  baseVersion: number;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  /** Absolute path of the Note once promoted, or null while the Task has no Note. */
  notePath: string | null;
}

/**
 * The Sync metadata for a Note. A Note shares its `id` with the Task it was
 * promoted from; `path` is Vault-relative so a Home and a Satellite can each
 * resolve it against their own Vault root. `content` is the full `.md` text
 * (frontmatter + body), kept here so changes are detected without a clock.
 */
export interface NoteSyncState {
  id: string;
  path: string;
  content: string;
  version: number;
  baseVersion: number;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Local persistence for Tasks, Notes and app settings (SQLite in the app). */
export interface LocalStore {
  getTask(id: string): Promise<Task | null>;
  getTasks(): Promise<Task[]>;
  saveTask(task: Task): Promise<void>;
  getNote(id: string): Promise<NoteSyncState | null>;
  getNotes(): Promise<NoteSyncState[]>;
  saveNote(note: NoteSyncState): Promise<void>;
  getVaultPath(): Promise<string | null>;
  saveVaultPath(path: string | null): Promise<void>;
}

/** Persistence for the `.md` files inside the Vault. */
export interface FileStore {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /**
   * Absolute paths of every `.md` file under `dir`, recursively. Notes in
   * subfolders are included.
   */
  list(dir: string): Promise<string[]>;
}

export interface CreateTaskInput {
  text: string;
  due?: string | null;
}

export interface UpdateTaskInput {
  text?: string;
  due?: string | null;
}

export interface TaskManagerDeps {
  localStore: LocalStore;
  fileStore: FileStore;
  /** Remote store and device identity; without them Sync stays off. */
  remoteStore?: RemoteStore;
  device?: DeviceInfo;
  /** Injectable clock for tests. */
  now?: () => Date;
  /** Injectable id factory for tests. */
  newId?: () => string;
}

export interface TaskManager {
  /** The chosen Vault folder, or null before the first Promote. */
  getVaultPath(): Promise<string | null>;
  /** Remembers the Vault folder so later sessions do not ask again. */
  setVaultPath(path: string): Promise<void>;

  createTask(input: CreateTaskInput): Promise<Task>;
  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  setTaskDone(id: string, done: boolean): Promise<Task>;
  updateTask(id: string, changes: UpdateTaskInput): Promise<Task>;
  /**
   * Deletes the Task for real. A tombstone stays in the store so the deletion
   * can reach other devices through Sync, and the Note is removed with it.
   */
  deleteTask(id: string): Promise<void>;
  /** Creates the Task's Note in the Vault and rewrites it on later changes. */
  promoteTask(id: string): Promise<Task>;
  /** Syncs Tasks with the remote store; a no-op without a `RemoteStore`. */
  sync(): Promise<void>;
  /**
   * Reconciles external edits to the Vault into Tasks: frontmatter changes
   * update `done`/`due`, a rename updates `text`, a deleted `.md` undoes the
   * Promote, and `.md` files without an `id` are ignored.
   */
  reconcileVault(): Promise<ReconcileResult>;
}

export interface ReconcileResult {
  /** Tasks whose fields changed because of an external edit to their Note. */
  changed: Task[];
  /** Notes in the Vault that carry an `id` and were linked to a Task. */
  scanned: number;
  /** `.md` files ignored because their frontmatter has no `id`. */
  ignored: number;
  /** Tasks whose Note was removed externally, undoing the Promote. */
  demoted: number;
}

export class VaultRequiredError extends Error {
  readonly code = "vault-required";

  constructor() {
    super("Choose a Vault folder before promoting a Task.");
    this.name = "VaultRequiredError";
  }
}

export class TaskNotFoundError extends Error {
  readonly code = "task-not-found";

  constructor(id: string) {
    super(`Task not found: ${id}`);
    this.name = "TaskNotFoundError";
  }
}

export class EmptyTaskTextError extends Error {
  readonly code = "empty-task-text";

  constructor() {
    super("A Task needs some text.");
    this.name = "EmptyTaskTextError";
  }
}
