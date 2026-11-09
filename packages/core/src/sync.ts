import { conflictCopyPath, formatNote, parseNote, resolvePath } from "./note";
import type {
  DeviceInfo,
  RemoteNote,
  RemoteStore,
  RemoteTask,
} from "./remote-store";
import type { FileStore, LocalStore, NoteSyncState, Task } from "./types";

export interface SyncEngineDeps {
  localStore: LocalStore;
  fileStore: FileStore;
  remoteStore: RemoteStore;
  device: DeviceInfo;
  now: () => Date;
  newId: () => string;
}

export interface SyncEngine {
  /** Mirrors this device's Tasks and Notes with the remote store, Home winning conflicts. */
  sync(): Promise<void>;
}

/** Maps a local Task to the fields the remote store keeps. */
function taskToRemote(task: Task): RemoteTask {
  return {
    id: task.id,
    title: task.text,
    done: task.done,
    due: task.due,
    version: task.version,
    deleted: task.deleted,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

/** Maps a local Note to the fields the remote store keeps. */
function noteToRemote(note: NoteSyncState): RemoteNote {
  return {
    id: note.id,
    path: note.path,
    content: note.content,
    version: note.version,
    deleted: note.deleted,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

/** Adopts a remote Task into the local store, keeping the local Note path. */
function adoptRemote(remote: RemoteTask, existing: Task | null): Task {
  return {
    id: remote.id,
    text: remote.title,
    done: remote.done,
    due: remote.due,
    version: remote.version,
    baseVersion: remote.version,
    deleted: remote.deleted,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    notePath: existing?.notePath ?? null,
  };
}

/**
 * The Sync engine for Tasks and Notes. It mirrors each item between a device
 * and the remote store using `version`/`baseVersion` (never timestamps): an
 * item is in conflict when the remote is ahead of this device's `baseVersion`
 * and this device also has a local change. In a conflict the Home wins and the
 * losing version becomes a Conflict copy — a "(conflito)" Task, or a
 * `Nome (conflito).md` Note — so nothing is lost in silence.
 */
export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { localStore, fileStore, remoteStore, device, now, newId } = deps;
  // The device identity is stable for the whole session; registering it on
  // every polling cycle was one idle write per cycle for no benefit.
  let deviceRegistered = false;

  async function push(task: Task): Promise<void> {
    await remoteStore.upsertTask(taskToRemote(task));
    await localStore.saveTask({ ...task, baseVersion: task.version });
  }

  async function createConflictCopy(loser: {
    text: string;
    done: boolean;
    due: string | null;
  }): Promise<Task> {
    const stamp = now().toISOString();
    return {
      id: newId(),
      text: `${loser.text} (conflito)`,
      done: loser.done,
      due: loser.due,
      version: 1,
      baseVersion: 0,
      deleted: false,
      createdAt: stamp,
      updatedAt: stamp,
      notePath: null,
    };
  }

  async function pushNote(note: NoteSyncState): Promise<void> {
    await remoteStore.upsertNote(noteToRemote(note));
    await localStore.saveNote({ ...note, baseVersion: note.version });
  }

  /**
   * Saves the loser of a Note conflict as a `Nome (conflito).md` Note with a
   * fresh id, so the user can review it and delete it. The copy is pushed too,
   * so it reaches the other device.
   */
  async function createConflictCopyNote(loser: RemoteNote): Promise<void> {
    const vaultPath = await localStore.getVaultPath();
    const parsed = parseNote(loser.content);
    const id = newId();
    const stamp = now().toISOString();
    const path = conflictCopyPath(loser.path);
    const content = formatNote({
      id,
      done: parsed?.done ?? false,
      due: parsed?.due ?? null,
      body: parsed?.body ?? loser.content,
    });
    if (vaultPath !== null) {
      await fileStore.write(resolvePath(vaultPath, path), content);
    }
    const note: NoteSyncState = {
      id,
      path,
      content,
      version: 1,
      baseVersion: 0,
      deleted: false,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await localStore.saveNote(note);
    await pushNote(note);
  }

  /** Adopts a remote Note: writes the file, points the Task at it, or removes both on a tombstone. */
  async function adoptRemoteNote(
    remote: RemoteNote,
    local: NoteSyncState | null,
  ): Promise<void> {
    const vaultPath = await localStore.getVaultPath();
    const absPath = vaultPath === null ? null : resolvePath(vaultPath, remote.path);

    if (remote.deleted) {
      if (local !== null && !local.deleted && vaultPath !== null) {
        await fileStore.remove(resolvePath(vaultPath, local.path));
      }
    } else if (absPath !== null) {
      await fileStore.write(absPath, remote.content);
    }

    // A renamed Note changed its relative path. Drop this device's copy at the
    // old path, otherwise the Vault keeps a stale duplicate that a later
    // reconcile would link back to the same Task.
    if (
      !remote.deleted &&
      local !== null &&
      local.path !== remote.path &&
      vaultPath !== null
    ) {
      await fileStore.remove(resolvePath(vaultPath, local.path));
    }

    // Point the Task at the adopted Note file, or clear it when the Note is gone.
    const task = await localStore.getTask(remote.id);
    if (task !== null && !task.deleted) {
      const notePath = remote.deleted || absPath === null ? null : absPath;
      if (task.notePath !== notePath) {
        await localStore.saveTask({ ...task, notePath });
      }
    }

    await localStore.saveNote({
      id: remote.id,
      path: remote.path,
      content: remote.content,
      version: remote.version,
      baseVersion: remote.version,
      deleted: remote.deleted,
      createdAt: remote.createdAt,
      updatedAt: remote.updatedAt,
    });
  }

  async function syncTasks(): Promise<void> {
    const remoteTasks = await remoteStore.listTasks();
    const localTasks = await localStore.getTasks();

    const remoteById = new Map(remoteTasks.map((task) => [task.id, task]));
    const localById = new Map(localTasks.map((task) => [task.id, task]));

    for (const id of new Set([...remoteById.keys(), ...localById.keys()])) {
      const remote = remoteById.get(id);
      const local = localById.get(id);

      if (remote === undefined) {
        if (local !== undefined && local.version > local.baseVersion) {
          await push(local);
        }
        continue;
      }

      if (local === undefined) {
        if (!remote.deleted) {
          await localStore.saveTask(adoptRemote(remote, null));
        }
        continue;
      }

      const localChanged = local.version > local.baseVersion;
      const remoteChanged = remote.version > local.baseVersion;

      if (localChanged && remoteChanged) {
        if (device.kind === "home") {
          if (!remote.deleted) {
            await push(
              await createConflictCopy({
                text: remote.title,
                done: remote.done,
                due: remote.due,
              }),
            );
          }
          const winner: Task = {
            ...local,
            version: Math.max(local.version, remote.version) + 1,
          };
          await push(winner);
        } else {
          if (!local.deleted) {
            await push(
              await createConflictCopy({
                text: local.text,
                done: local.done,
                due: local.due,
              }),
            );
          }
          await localStore.saveTask(adoptRemote(remote, local));
        }
      } else if (remoteChanged) {
        await localStore.saveTask(adoptRemote(remote, local));
      } else if (localChanged) {
        await push(local);
      }
    }
  }

  async function syncNotes(): Promise<void> {
    const remoteNotes = await remoteStore.listNotes();
    const localNotes = await localStore.getNotes();

    const remoteById = new Map(remoteNotes.map((note) => [note.id, note]));
    const localById = new Map(localNotes.map((note) => [note.id, note]));

    for (const id of new Set([...remoteById.keys(), ...localById.keys()])) {
      const remote = remoteById.get(id);
      const local = localById.get(id);

      if (remote === undefined) {
        if (local !== undefined && local.version > local.baseVersion) {
          await pushNote(local);
        }
        continue;
      }

      if (local === undefined) {
        if (!remote.deleted) {
          await adoptRemoteNote(remote, null);
        }
        continue;
      }

      const localChanged = local.version > local.baseVersion;
      const remoteChanged = remote.version > local.baseVersion;

      if (localChanged && remoteChanged) {
        if (device.kind === "home") {
          if (!remote.deleted) {
            await createConflictCopyNote(remote);
          }
          const winner: NoteSyncState = {
            ...local,
            version: Math.max(local.version, remote.version) + 1,
          };
          await pushNote(winner);
        } else {
          if (!local.deleted) {
            await createConflictCopyNote(noteToRemote(local));
          }
          await adoptRemoteNote(remote, local);
        }
      } else if (remoteChanged) {
        await adoptRemoteNote(remote, local);
      } else if (localChanged) {
        await pushNote(local);
      }
    }
  }

  async function sync(): Promise<void> {
    if (!deviceRegistered) {
      const stamp = now().toISOString();
      await remoteStore.registerDevice({
        id: device.id,
        name: device.name,
        kind: device.kind,
        createdAt: stamp,
        updatedAt: stamp,
      });
      // Only mark it done after the remote accepted it, so a failed first
      // attempt is retried by the next cycle.
      deviceRegistered = true;
    }

    await syncTasks();
    await syncNotes();
  }

  return { sync };
}
