import "fake-indexeddb/auto";
import {
  createTaskManager,
  type DeviceInfo,
  type RemoteDevice,
  type RemoteNote,
  type RemoteStore,
  type RemoteTask,
  type TaskManager,
} from "@taskmanager/core";
import { describe, expect, it } from "vitest";
import { createIndexedDBFileStore } from "./indexeddb-file-store";
import { createIndexedDBLocalStore } from "./indexeddb-local-store";

const VAULT = "/vault";

const HOME: DeviceInfo = { id: "device-home", name: "Mac", kind: "home" };
const SATELLITE: DeviceInfo = {
  id: "device-satellite",
  name: "iPhone",
  kind: "satellite",
};

let sequence = 0;

function uniqueDatabase(prefix: string): string {
  sequence += 1;
  return `taskmanager-${prefix}-${Date.now()}-${sequence}`;
}

/** In-memory stand-in for the Supabase-backed RemoteStore. */
function createMemoryRemoteStore(): RemoteStore {
  const tasks = new Map<string, RemoteTask>();
  const notes = new Map<string, RemoteNote>();
  const devices = new Map<string, RemoteDevice>();

  return {
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

interface Setup {
  home: TaskManager;
  satellite: TaskManager;
  homeDb: string;
  satelliteDb: string;
}

function setup(): Setup {
  const remoteStore = createMemoryRemoteStore();
  const homeDb = uniqueDatabase("sync-home");
  const satelliteDb = uniqueDatabase("sync-satellite");

  const home = createTaskManager({
    localStore: createIndexedDBLocalStore({
      databaseName: homeDb,
      vaultPath: VAULT,
    }),
    fileStore: createIndexedDBFileStore({ databaseName: homeDb }),
    remoteStore,
    device: HOME,
  });

  const satellite = createTaskManager({
    localStore: createIndexedDBLocalStore({
      databaseName: satelliteDb,
      vaultPath: VAULT,
    }),
    fileStore: createIndexedDBFileStore({ databaseName: satelliteDb }),
    remoteStore,
    device: SATELLITE,
  });

  return { home, satellite, homeDb, satelliteDb };
}

/** A full round of Home and Satellite syncs, enough to reach a fixed point. */
async function syncBoth(home: TaskManager, satellite: TaskManager) {
  await home.sync();
  await satellite.sync();
  await home.sync();
  await satellite.sync();
}

describe("Sync with the IndexedDB stores", () => {
  it("mirrors a Task and its Note between the Home and the Satellite", async () => {
    const { home, satellite, satelliteDb, homeDb } = setup();
    const task = await home.createTask({ text: "Buy milk" });

    await syncBoth(home, satellite);
    await expect(satellite.getTask(task.id)).resolves.toMatchObject({
      id: task.id,
      text: "Buy milk",
      notePath: null,
    });

    await home.promoteTask(task.id);
    await syncBoth(home, satellite);

    const satelliteStore = createIndexedDBLocalStore({
      databaseName: satelliteDb,
      vaultPath: VAULT,
    });
    const satelliteFiles = createIndexedDBFileStore({
      databaseName: satelliteDb,
    });
    const adoptedNote = await satelliteStore.getNote(task.id);
    expect(adoptedNote).toMatchObject({
      id: task.id,
      path: "Buy milk.md",
      deleted: false,
    });
    await expect(satelliteFiles.read("/vault/Buy milk.md")).resolves.toBe(
      adoptedNote?.content,
    );
    await expect(satellite.getTask(task.id)).resolves.toMatchObject({
      notePath: "/vault/Buy milk.md",
    });

    // The Satellite (a PWA) edits the Note through its Task; the Home adopts
    // the rename and the new content from the remote store.
    await satellite.updateTask(task.id, { text: "Buy oat milk" });
    await syncBoth(home, satellite);

    await expect(home.getTask(task.id)).resolves.toMatchObject({
      text: "Buy oat milk",
      notePath: "/vault/Buy oat milk.md",
    });
    const homeStore = createIndexedDBLocalStore({
      databaseName: homeDb,
      vaultPath: VAULT,
    });
    const homeFiles = createIndexedDBFileStore({ databaseName: homeDb });
    await expect(homeStore.getNote(task.id)).resolves.toMatchObject({
      path: "Buy oat milk.md",
    });
    await expect(homeFiles.read("/vault/Buy oat milk.md")).resolves.toContain(
      `id: ${task.id}`,
    );
    await expect(homeFiles.exists("/vault/Buy milk.md")).resolves.toBe(false);
  });

  it("stores the Satellite's losing Note as a Conflict copy in IndexedDB", async () => {
    const { home, satellite, satelliteDb } = setup();
    const task = await home.createTask({ text: "Buy milk" });
    await home.promoteTask(task.id);
    await syncBoth(home, satellite);

    // Both devices edit before syncing: the Home wins, the Satellite loses.
    await home.updateTask(task.id, { text: "Home title" });
    await satellite.updateTask(task.id, { text: "Satellite title" });
    await syncBoth(home, satellite);

    await expect(satellite.getTask(task.id)).resolves.toMatchObject({
      text: "Home title",
    });
    const tasks = await satellite.listTasks();
    expect(tasks.map((current) => current.text)).toContain(
      "Satellite title (conflito)",
    );

    const satelliteStore = createIndexedDBLocalStore({
      databaseName: satelliteDb,
      vaultPath: VAULT,
    });
    const satelliteFiles = createIndexedDBFileStore({
      databaseName: satelliteDb,
    });
    const paths = (await satelliteStore.getNotes()).map((note) => note.path);
    expect(paths).toContain("Satellite title (conflito).md");
    await expect(
      satelliteFiles.exists("/vault/Satellite title (conflito).md"),
    ).resolves.toBe(true);
  });
});
