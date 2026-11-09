import {
  EmptyTaskTextError,
  TaskNotFoundError,
  VaultRequiredError,
  type CreateTaskInput,
  type Task,
  type TaskManager,
  type TaskManagerDeps,
  type UpdateTaskInput,
} from "./types";
import { formatNote, joinPath, noteFileName, parseNote, relativePath } from "./note";
import { recordNoteChange } from "./note-sync";
import { createSyncEngine } from "./sync";
import { uuidv7 } from "./uuid";
import { reconcileVault } from "./vault-watch";
import {
  buildVaultTree,
  managedNotePaths,
  readManagedNote,
} from "./vault-tree";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDue(due: string | null | undefined): string | null {
  if (due === undefined || due === null || due.trim() === "") {
    return null;
  }
  const day = due.trim();
  if (!DAY_PATTERN.test(day)) {
    throw new RangeError(`Due date must be a day (YYYY-MM-DD): ${due}`);
  }
  return day;
}

function normalizeVaultPath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  if (trimmed === "") {
    throw new RangeError("Vault path cannot be empty.");
  }
  return trimmed;
}

export function createTaskManager(deps: TaskManagerDeps): TaskManager {
  const { localStore, fileStore } = deps;
  const now = deps.now ?? (() => new Date());
  const newId =
    deps.newId ?? (() => uuidv7(deps.now ? deps.now() : new Date()));

  const syncEngine =
    deps.remoteStore !== undefined && deps.device !== undefined
      ? createSyncEngine({
          localStore,
          fileStore,
          remoteStore: deps.remoteStore,
          device: deps.device,
          now,
          newId,
        })
      : null;

  async function requireTask(id: string): Promise<Task> {
    const task = await localStore.getTask(id);
    if (task === null || task.deleted) {
      throw new TaskNotFoundError(id);
    }
    return task;
  }

  async function save(task: Task): Promise<Task> {
    await localStore.saveTask(task);
    return task;
  }

  async function notePathFor(
    task: Task,
    title: string,
    folder: string,
  ): Promise<string> {
    const fileName = noteFileName(title);
    const stem = fileName.replace(/\.md$/i, "");

    for (let attempt = 1; ; attempt += 1) {
      const candidate = joinPath(
        folder,
        attempt === 1 ? fileName : `${stem} (${attempt}).md`,
      );
      if (candidate === task.notePath) {
        return candidate;
      }
      if (!(await fileStore.exists(candidate))) {
        return candidate;
      }
      const content = await fileStore.read(candidate);
      if (content !== null && parseNote(content)?.id === task.id) {
        return candidate;
      }
    }
  }

  function folderOf(path: string): string {
    const separator = path.lastIndexOf("/");
    if (separator === -1) {
      return "";
    }
    return separator === 0 ? "/" : path.slice(0, separator);
  }

  function touch(task: Task): Task {
    return {
      ...task,
      version: task.version + 1,
      updatedAt: now().toISOString(),
    };
  }

  /** Rewrites the Note's frontmatter from the Task, keeping the free-form body. */
  async function rewriteNote(
    task: Task,
  ): Promise<{ task: Task; content: string | null }> {
    if (task.notePath === null) {
      return { task, content: null };
    }
    const current = await fileStore.read(task.notePath);
    if (current === null) {
      // The Note is gone: the Task goes back to having no file.
      return { task: { ...task, notePath: null }, content: null };
    }
    const body = parseNote(current)?.body ?? "";
    const content = formatNote({
      id: task.id,
      done: task.done,
      due: task.due,
      body,
    });
    await fileStore.write(task.notePath, content);
    return { task, content };
  }

  /** Records a Note content change so Sync can detect it. */
  async function recordNoteContent(task: Task, content: string): Promise<void> {
    if (task.notePath === null) {
      return;
    }
    const vaultPath = await localStore.getVaultPath();
    await recordNoteChange(localStore, {
      id: task.id,
      path: relativePath(vaultPath ?? task.notePath, task.notePath),
      content,
      deleted: false,
      createdAt: task.createdAt,
      updatedAt: now().toISOString(),
    });
  }

  /** Records a Note deletion so its tombstone reaches the other devices. */
  async function recordNoteDeletion(task: Task): Promise<void> {
    if (task.notePath === null) {
      return;
    }
    const vaultPath = await localStore.getVaultPath();
    await recordNoteChange(localStore, {
      id: task.id,
      path: relativePath(vaultPath ?? task.notePath, task.notePath),
      content: "",
      deleted: true,
      createdAt: task.createdAt,
      updatedAt: now().toISOString(),
    });
  }

  return {
    async getVaultPath() {
      return localStore.getVaultPath();
    },

    async setVaultPath(path) {
      await localStore.saveVaultPath(normalizeVaultPath(path));
    },

    async createTask(input: CreateTaskInput) {
      const text = input.text.trim();
      if (text === "") {
        throw new EmptyTaskTextError();
      }
      const timestamp = now().toISOString();
      const task: Task = {
        id: newId(),
        text,
        done: false,
        due: normalizeDue(input.due),
        version: 1,
        baseVersion: 0,
        deleted: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        notePath: null,
      };
      return save(task);
    },

    async listTasks() {
      const tasks = await localStore.getTasks();
      return tasks.filter((task) => !task.deleted);
    },

    async getTask(id) {
      const task = await localStore.getTask(id);
      return task === null || task.deleted ? null : task;
    },

    async setTaskDone(id, done) {
      const task = await requireTask(id);
      const changed = touch({ ...task, done });
      const { task: rewritten, content } = await rewriteNote(changed);
      if (content !== null) {
        await recordNoteContent(rewritten, content);
      }
      return save(rewritten);
    },

    async updateTask(id, changes: UpdateTaskInput) {
      const task = await requireTask(id);
      const next: Task = { ...task };
      if (changes.text !== undefined) {
        const text = changes.text.trim();
        if (text === "") {
          throw new EmptyTaskTextError();
        }
        next.text = text;
      }
      if (changes.due !== undefined) {
        next.due = normalizeDue(changes.due);
      }

      let changed = touch(next);
      if (changed.notePath !== null) {
        const current = await fileStore.read(changed.notePath);
        if (current === null) {
          return save({ ...changed, notePath: null });
        }
        const path = await notePathFor(
          changed,
          changed.text,
          folderOf(changed.notePath),
        );
        const body = parseNote(current)?.body ?? "";
        const content = formatNote({
          id: changed.id,
          done: changed.done,
          due: changed.due,
          body,
        });
        await fileStore.write(path, content);
        if (path !== changed.notePath) {
          await fileStore.remove(changed.notePath);
        }
        changed = { ...changed, notePath: path };
        await recordNoteContent(changed, content);
      }
      return save(changed);
    },

    async deleteTask(id) {
      const task = await requireTask(id);
      // The Note belongs to the Task; deleting the Task must not leave an
      // orphan `.md` that a later Vault scan would bring back.
      if (task.notePath !== null) {
        await recordNoteDeletion(task);
        await fileStore.remove(task.notePath);
      }
      await localStore.saveTask(
        touch({ ...task, deleted: true, notePath: null }),
      );
    },

    async promoteTask(id) {
      const task = await requireTask(id);
      const vaultPath = await localStore.getVaultPath();
      if (vaultPath === null) {
        throw new VaultRequiredError();
      }
      const folder = task.notePath === null ? vaultPath : folderOf(task.notePath);
      const path = await notePathFor(task, task.text, folder);

      const current = await fileStore.read(path);
      const body = current === null ? "" : (parseNote(current)?.body ?? "");
      const content = formatNote({
        id: task.id,
        done: task.done,
        due: task.due,
        body,
      });
      await fileStore.write(path, content);

      if (task.notePath !== null && task.notePath !== path) {
        await fileStore.remove(task.notePath);
      }

      const promoted = { ...task, notePath: path };
      await recordNoteContent(promoted, content);
      return save(promoted);
    },

    async sync() {
      if (syncEngine !== null) {
        await syncEngine.sync();
      }
    },

    async reconcileVault() {
      return reconcileVault({ localStore, fileStore, now });
    },

    async listVaultTree() {
      const vaultPath = await localStore.getVaultPath();
      if (vaultPath === null) {
        return null;
      }
      const root = vaultPath.replace(/\/+$/, "");
      const notes = await localStore.getNotes();
      return buildVaultTree(
        root,
        await fileStore.list(root),
        managedNotePaths(root, notes),
      );
    },

    async readNote(path) {
      const vaultPath = await localStore.getVaultPath();
      if (vaultPath === null) {
        return null;
      }
      return readManagedNote(
        vaultPath.replace(/\/+$/, ""),
        await localStore.getNotes(),
        fileStore,
        path,
      );
    },
  };
}
