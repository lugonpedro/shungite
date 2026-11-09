import { describe, expect, it } from "vitest";
import { createShungite, type Shungite } from "./index";
import type {
  DeviceInfo,
  RemoteNote,
  RemoteStore,
  RemoteTask,
} from "./remote-store";
import {
  createMemoryFileStore,
  createMemoryLocalStore,
  createMemoryRemoteStore,
} from "./test-support";

const homeDevice: DeviceInfo = {
  id: "device-home",
  name: "Mac",
  kind: "home",
};
const satelliteDevice: DeviceInfo = {
  id: "device-satellite",
  name: "iPhone",
  kind: "satellite",
};

function setup() {
  const remoteStore = createMemoryRemoteStore();
  const home = createShungite({
    localStore: createMemoryLocalStore(),
    fileStore: createMemoryFileStore(),
    remoteStore,
    device: homeDevice,
  });
  const satellite = createShungite({
    localStore: createMemoryLocalStore(),
    fileStore: createMemoryFileStore(),
    remoteStore,
    device: satelliteDevice,
  });
  return { home, satellite, remoteStore };
}

/** A full round of Home and Satellite syncs, enough to reach a fixed point. */
async function syncBoth(home: Shungite, satellite: Shungite) {
  await home.sync();
  await satellite.sync();
  await home.sync();
  await satellite.sync();
}

describe("Sync", () => {
  it("syncs a Task created on the Home to the Satellite", async () => {
    const { home, satellite } = setup();
    const task = await home.createTask({ text: "Buy milk" });

    await syncBoth(home, satellite);

    await expect(satellite.listTasks()).resolves.toMatchObject([
      { id: task.id, text: "Buy milk", done: false, due: null },
    ]);
  });

  it("syncs a Task created on the Satellite to the Home", async () => {
    const { home, satellite } = setup();
    const task = await satellite.createTask({ text: "Buy milk" });

    await syncBoth(home, satellite);

    await expect(home.listTasks()).resolves.toMatchObject([
      { id: task.id, text: "Buy milk" },
    ]);
  });

  it("applies a change from either device when only one side changed", async () => {
    const { home, satellite } = setup();
    const task = await home.createTask({ text: "Buy milk" });
    await syncBoth(home, satellite);

    // Satellite edits, Home was idle: the Satellite's change wins.
    await satellite.updateTask(task.id, { text: "Buy oat milk" });
    await syncBoth(home, satellite);
    await expect(home.getTask(task.id)).resolves.toMatchObject({
      text: "Buy oat milk",
    });

    // Home edits, Satellite was idle: the Home's change wins.
    await home.setTaskDone(task.id, true);
    await syncBoth(home, satellite);
    await expect(satellite.getTask(task.id)).resolves.toMatchObject({
      done: true,
    });
  });

  it("resolves a conflict with Home winning and a (conflito) Task for the loser", async () => {
    const { home, satellite } = setup();
    const task = await home.createTask({ text: "Plan trip" });
    await syncBoth(home, satellite);

    await home.updateTask(task.id, { text: "Plan trip home" });
    await satellite.updateTask(task.id, { text: "Plan trip satellite" });
    await syncBoth(home, satellite);

    await expect(home.getTask(task.id)).resolves.toMatchObject({
      text: "Plan trip home",
    });
    await expect(satellite.getTask(task.id)).resolves.toMatchObject({
      text: "Plan trip home",
    });

    const texts = (await home.listTasks()).map((t) => t.text);
    expect(texts).toContain("Plan trip satellite (conflito)");
  });

  it("decides the conflict by version even with swapped clocks", async () => {
    const remoteStore = createMemoryRemoteStore();
    const homeClock = () => new Date("2026-01-01T00:00:00.000Z");
    const satelliteClock = () => new Date("2026-12-31T00:00:00.000Z");
    const home = createShungite({
      localStore: createMemoryLocalStore(),
      fileStore: createMemoryFileStore(),
      remoteStore,
      device: homeDevice,
      now: homeClock,
    });
    const satellite = createShungite({
      localStore: createMemoryLocalStore(),
      fileStore: createMemoryFileStore(),
      remoteStore,
      device: satelliteDevice,
      now: satelliteClock,
    });

    const task = await home.createTask({ text: "Plan trip" });
    await syncBoth(home, satellite);

    await home.updateTask(task.id, { text: "Plan trip home" });
    await satellite.updateTask(task.id, { text: "Plan trip satellite" });

    // The Satellite's clock is ahead, so its edit looks newer on timestamps.
    const homeTask = await home.getTask(task.id);
    const satelliteTask = await satellite.getTask(task.id);
    expect(satelliteTask!.updatedAt > homeTask!.updatedAt).toBe(true);

    await syncBoth(home, satellite);

    // The Home still wins: conflict is decided by version, never by clock.
    await expect(home.getTask(task.id)).resolves.toMatchObject({
      text: "Plan trip home",
    });
    await expect(satellite.getTask(task.id)).resolves.toMatchObject({
      text: "Plan trip home",
    });
    expect((await home.listTasks()).map((t) => t.text)).toContain(
      "Plan trip satellite (conflito)",
    );
  });

  it("propagates a deletion so the Task disappears everywhere", async () => {
    const { home, satellite } = setup();
    const task = await home.createTask({ text: "Buy milk" });
    await syncBoth(home, satellite);

    await satellite.deleteTask(task.id);
    await syncBoth(home, satellite);

    await expect(home.listTasks()).resolves.toEqual([]);
    await expect(satellite.listTasks()).resolves.toEqual([]);
  });

  it("registers the Vault device as Home and the other as Satellite", async () => {
    const { home, satellite, remoteStore } = setup();
    await home.setVaultPath("/vault");

    await syncBoth(home, satellite);

    expect(remoteStore.devices.get(homeDevice.id)).toMatchObject({
      kind: "home",
    });
    expect(remoteStore.devices.get(satelliteDevice.id)).toMatchObject({
      kind: "satellite",
    });
  });

  it("registers the device once per engine, not on every cycle", async () => {
    const remoteStore = createMemoryRemoteStore();
    let registrations = 0;
    const counting: RemoteStore = {
      ...remoteStore,
      async registerDevice(device) {
        registrations += 1;
        await remoteStore.registerDevice(device);
      },
    };
    const core = createShungite({
      localStore: createMemoryLocalStore(),
      fileStore: createMemoryFileStore(),
      remoteStore: counting,
      device: homeDevice,
    });

    await core.sync();
    await core.sync();
    await core.sync();
    expect(registrations).toBe(1);

    // A new session gets a fresh engine, so it registers once again.
    core.setRemoteStore(counting);
    await core.sync();
    expect(registrations).toBe(2);
  });

  it("reports pending local work until a round pushes it", async () => {
    const { home } = setup();

    await expect(home.hasPendingSync()).resolves.toBe(false);
    await home.createTask({ text: "Buy milk" });
    await expect(home.hasPendingSync()).resolves.toBe(true);

    await home.sync();
    await expect(home.hasPendingSync()).resolves.toBe(false);
  });
});

/** A deterministic timestamp, far enough apart to make cursors unambiguous. */
function at(seconds: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
}

function remoteTask(
  id: string,
  updatedAt: string,
  overrides: Partial<RemoteTask> = {},
): RemoteTask {
  return {
    id,
    title: id,
    done: false,
    due: null,
    version: 1,
    deleted: false,
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

function remoteNote(
  id: string,
  updatedAt: string,
  overrides: Partial<RemoteNote> = {},
): RemoteNote {
  return {
    id,
    path: `${id}.md`,
    content: id,
    version: 1,
    deleted: false,
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

describe("incremental Sync cursor", () => {
  it("reads everything on the first round, then only the task delta and tombstones", async () => {
    const remote = createMemoryRemoteStore();
    const taskSince: Array<string | undefined> = [];
    const store: RemoteStore = {
      ...remote,
      async listTasks(since) {
        taskSince.push(since);
        return remote.listTasks(since);
      },
    };
    const localStore = createMemoryLocalStore();
    const home = createShungite({
      localStore,
      fileStore: createMemoryFileStore(),
      remoteStore: store,
      device: homeDevice,
    });

    await remote.upsertTask(remoteTask("a", at(10)));
    await remote.upsertTask(remoteTask("b", at(20)));

    await home.sync();
    // No cursor yet: the first round must read every row.
    expect(taskSince).toEqual([undefined]);
    expect((await home.listTasks()).map((task) => task.id).sort()).toEqual([
      "a",
      "b",
    ]);
    await expect(localStore.getSyncCursor("tasks")).resolves.toBe(at(20));

    await remote.upsertTask(
      remoteTask("b", at(30), { version: 2, title: "b updated" }),
    );
    await home.sync();
    expect(taskSince).toEqual([undefined, at(20)]);
    await expect(home.getTask("b")).resolves.toMatchObject({
      text: "b updated",
    });
    await expect(localStore.getSyncCursor("tasks")).resolves.toBe(at(30));

    // A tombstone is part of the delta, not filtered out: it must reach the
    // device so a remote deletion is not resurrected by the next push.
    await remote.upsertTask(
      remoteTask("b", at(40), {
        version: 3,
        deleted: true,
      }),
    );
    await home.sync();
    expect(taskSince).toEqual([undefined, at(20), at(30)]);
    expect((await home.listTasks()).map((task) => task.id)).toEqual(["a"]);
    await expect(localStore.getTask("b")).resolves.toMatchObject({
      deleted: true,
    });
  });

  it("keeps a separate cursor per table and filters the notes delta", async () => {
    const remote = createMemoryRemoteStore();
    const noteSince: Array<string | undefined> = [];
    const store: RemoteStore = {
      ...remote,
      async listNotes(since) {
        noteSince.push(since);
        return remote.listNotes(since);
      },
    };
    const localStore = createMemoryLocalStore();
    const home = createShungite({
      localStore,
      fileStore: createMemoryFileStore(),
      remoteStore: store,
      device: homeDevice,
    });

    await remote.upsertNote(remoteNote("n1", at(10)));
    await remote.upsertNote(remoteNote("n2", at(20)));

    await home.sync();
    expect(noteSince).toEqual([undefined]);
    await expect(localStore.getSyncCursor("notes")).resolves.toBe(at(20));
    // Tasks had no delta, so their cursor is still absent.
    await expect(localStore.getSyncCursor("tasks")).resolves.toBeNull();

    await remote.upsertNote(
      remoteNote("n1", at(30), { version: 2, content: "changed" }),
    );
    await home.sync();
    expect(noteSince).toEqual([undefined, at(20)]);
    await expect(localStore.getNote("n1")).resolves.toMatchObject({
      content: "changed",
    });
    await expect(localStore.getSyncCursor("notes")).resolves.toBe(at(30));
  });
});
