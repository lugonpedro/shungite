import type { DeviceInfo, RemoteStore, RemoteTask } from "./remote-store";
import type { LocalStore, Task } from "./types";

export interface SyncEngineDeps {
  localStore: LocalStore;
  remoteStore: RemoteStore;
  device: DeviceInfo;
  now: () => Date;
  newId: () => string;
}

export interface SyncEngine {
  /** Mirrors this device's Tasks with the remote store, Home winning conflicts. */
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
 * The Sync engine for Tasks. It mirrors each Task between a device and the
 * remote store using `version`/`baseVersion` (never timestamps): a Task is in
 * conflict when the remote is ahead of this device's `baseVersion` and this
 * device also has a local change. In a conflict the Home wins and the losing
 * version becomes a "(conflito)" Task, so nothing is lost in silence.
 */
export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { localStore, remoteStore, device, now, newId } = deps;

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

  async function sync(): Promise<void> {
    const stamp = now().toISOString();
    await remoteStore.registerDevice({
      id: device.id,
      name: device.name,
      kind: device.kind,
      createdAt: stamp,
      updatedAt: stamp,
    });

    const remoteTasks = await remoteStore.listTasks();
    const localTasks = await localStore.getTasks();

    const remoteById = new Map(remoteTasks.map((task) => [task.id, task]));
    const localById = new Map(localTasks.map((task) => [task.id, task]));

    for (const id of new Set([...remoteById.keys(), ...localById.keys()])) {
      const remote = remoteById.get(id);
      const local = localById.get(id);

      if (remote === undefined) {
        // Local only: push it up when it changed since the last sync.
        if (local !== undefined && local.version > local.baseVersion) {
          await push(local);
        }
        continue;
      }

      if (local === undefined) {
        // Remote only: adopt it, ignoring tombstones we never held.
        if (!remote.deleted) {
          await localStore.saveTask(adoptRemote(remote, null));
        }
        continue;
      }

      const localChanged = local.version > local.baseVersion;
      const remoteChanged = remote.version > local.baseVersion;

      if (localChanged && remoteChanged) {
        // Conflict: the Home wins and the losing version becomes a
        // "(conflito)" Task.
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
          // Bump past the remote so the loser sees the change on its next sync.
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

  return { sync };
}
