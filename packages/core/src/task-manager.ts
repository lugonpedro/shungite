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
import { formatNote, joinPath, noteFileName, parseNote } from "./note";
import { createSyncEngine } from "./sync";
import { uuidv7 } from "./uuid";

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
  async function rewriteNote(task: Task): Promise<Task> {
    if (task.notePath === null) {
      return task;
    }
    const current = await fileStore.read(task.notePath);
    if (current === null) {
      // The Note is gone: the Task goes back to having no file.
      return { ...task, notePath: null };
    }
    const body = parseNote(current)?.body ?? "";
    await fileStore.write(
      task.notePath,
      formatNote({ id: task.id, done: task.done, due: task.due, body }),
    );
    return task;
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
      return save(await rewriteNote(changed));
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
        await fileStore.write(
          path,
          formatNote({
            id: changed.id,
            done: changed.done,
            due: changed.due,
            body,
          }),
        );
        if (path !== changed.notePath) {
          await fileStore.remove(changed.notePath);
        }
        changed = { ...changed, notePath: path };
      }
      return save(changed);
    },

    async deleteTask(id) {
      const task = await requireTask(id);
      // The Note belongs to the Task; deleting the Task must not leave an
      // orphan `.md` that a later Vault scan would bring back.
      if (task.notePath !== null) {
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
      await fileStore.write(
        path,
        formatNote({ id: task.id, done: task.done, due: task.due, body }),
      );

      if (task.notePath !== null && task.notePath !== path) {
        await fileStore.remove(task.notePath);
      }

      return save({ ...task, notePath: path });
    },

    async sync() {
      if (syncEngine !== null) {
        await syncEngine.sync();
      }
    },
  };
}
