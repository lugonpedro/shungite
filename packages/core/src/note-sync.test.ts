import { describe, expect, it } from "vitest";
import { createTaskManager, type TaskManager } from "./index";
import type { DeviceInfo } from "./remote-store";
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

const HOME_VAULT = "/vault";
const SATELLITE_VAULT = "/sat-vault";

function setup() {
  const remoteStore = createMemoryRemoteStore();
  const homeFileStore = createMemoryFileStore();
  const satelliteFileStore = createMemoryFileStore();
  const home = createTaskManager({
    localStore: createMemoryLocalStore(),
    fileStore: homeFileStore,
    remoteStore,
    device: homeDevice,
  });
  const satellite = createTaskManager({
    localStore: createMemoryLocalStore(),
    fileStore: satelliteFileStore,
    remoteStore,
    device: satelliteDevice,
  });
  return { home, satellite, remoteStore, homeFileStore, satelliteFileStore };
}

async function withVaults(home: TaskManager, satellite: TaskManager) {
  await home.setVaultPath(HOME_VAULT);
  await satellite.setVaultPath(SATELLITE_VAULT);
}

/** A full round of Home and Satellite syncs, enough to reach a fixed point. */
async function syncBoth(home: TaskManager, satellite: TaskManager) {
  await home.sync();
  await satellite.sync();
  await home.sync();
  await satellite.sync();
}

describe("Note sync", () => {
  it("syncs a Note promoted on the Home to the Satellite with its full content", async () => {
    const { home, satellite, homeFileStore, satelliteFileStore } = setup();
    await withVaults(home, satellite);

    const task = await home.createTask({ text: "Write report" });
    await home.promoteTask(task.id);
    // Free-form body added outside the app, e.g. in Obsidian.
    const full = `---\nid: ${task.id}\ndone: false\ndue:\n---\n\nFull body text\n`;
    await homeFileStore.write("/vault/Write report.md", full);
    await home.reconcileVault();

    await syncBoth(home, satellite);

    expect(satelliteFileStore.files.get("/sat-vault/Write report.md")).toBe(full);
    await expect(satellite.getTask(task.id)).resolves.toMatchObject({
      notePath: "/sat-vault/Write report.md",
    });
  });

  it("applies a Note edit made only on the Satellite to the Home", async () => {
    const { home, satellite, homeFileStore } = setup();
    await withVaults(home, satellite);

    const task = await home.createTask({ text: "Write report" });
    await home.promoteTask(task.id);
    await syncBoth(home, satellite);

    await satellite.setTaskDone(task.id, true);
    await syncBoth(home, satellite);

    await expect(home.getTask(task.id)).resolves.toMatchObject({ done: true });
    expect(homeFileStore.files.get("/vault/Write report.md")).toContain(
      "done: true",
    );
  });

  it("resolves a Note conflict with Home winning and a (conflito) copy for the loser", async () => {
    const { home, satellite, homeFileStore } = setup();
    await withVaults(home, satellite);

    const task = await home.createTask({ text: "Write report" });
    await home.promoteTask(task.id);
    await syncBoth(home, satellite);

    await home.setTaskDone(task.id, true);
    await satellite.updateTask(task.id, { text: "Renamed on iPhone" });
    await syncBoth(home, satellite);

    // The Home wins: both devices settle on the Home's title and done state.
    await expect(home.getTask(task.id)).resolves.toMatchObject({
      text: "Write report",
      done: true,
    });
    await expect(satellite.getTask(task.id)).resolves.toMatchObject({
      text: "Write report",
      done: true,
    });

    // The losing Note becomes a Conflict copy file carrying the loser's content.
    const conflictPath = "/vault/Renamed on iPhone (conflito).md";
    expect(homeFileStore.files.has(conflictPath)).toBe(true);
    expect(homeFileStore.files.get(conflictPath)).toContain("done: false");
  });

  it("keeps Home winning even when the Satellite syncs first", async () => {
    const { home, satellite, homeFileStore } = setup();
    await withVaults(home, satellite);

    const task = await home.createTask({ text: "Write report" });
    await home.promoteTask(task.id);
    await syncBoth(home, satellite);

    await home.setTaskDone(task.id, true);
    await satellite.updateTask(task.id, { text: "Renamed on iPhone" });

    // The Satellite wins the race to the server, but the Home still wins.
    await satellite.sync();
    await home.sync();
    await satellite.sync();

    await expect(home.getTask(task.id)).resolves.toMatchObject({
      text: "Write report",
      done: true,
    });
    await expect(satellite.getTask(task.id)).resolves.toMatchObject({
      text: "Write report",
      done: true,
    });
    expect(homeFileStore.files.has("/vault/Renamed on iPhone (conflito).md")).toBe(
      true,
    );
  });

  it("propagates a deleted Note so it disappears on the other device", async () => {
    const { home, satellite, homeFileStore } = setup();
    await withVaults(home, satellite);

    const task = await home.createTask({ text: "Write report" });
    await home.promoteTask(task.id);
    await syncBoth(home, satellite);

    await satellite.deleteTask(task.id);
    await syncBoth(home, satellite);

    expect(homeFileStore.files.has("/vault/Write report.md")).toBe(false);
    await expect(home.listTasks()).resolves.toEqual([]);
  });

  it("applies everything when a long-offline Home returns, and the Satellite never becomes Home", async () => {
    const { home, satellite, remoteStore, homeFileStore } = setup();
    await withVaults(home, satellite);

    const task = await home.createTask({ text: "Write report" });
    await home.promoteTask(task.id);
    await syncBoth(home, satellite);

    // The Home goes offline; the Satellite keeps editing.
    await satellite.setTaskDone(task.id, true);
    await satellite.updateTask(task.id, { text: "Renamed offline" });
    const extra = await satellite.createTask({ text: "New note" });
    await satellite.promoteTask(extra.id);

    // Only the Satellite syncs while the Home is away.
    await satellite.sync();

    // The Home returns and applies everything the Satellite produced.
    await home.sync();
    await satellite.sync();

    await expect(home.getTask(task.id)).resolves.toMatchObject({
      text: "Renamed offline",
      done: true,
    });
    await expect(home.getTask(extra.id)).resolves.toMatchObject({
      text: "New note",
    });
    expect(homeFileStore.files.has("/vault/Renamed offline.md")).toBe(true);
    expect(homeFileStore.files.has("/vault/New note.md")).toBe(true);

    // The Satellite stayed a Satellite; the Home stayed the Home.
    expect(remoteStore.devices.get(satelliteDevice.id)).toMatchObject({
      kind: "satellite",
    });
    expect(remoteStore.devices.get(homeDevice.id)).toMatchObject({
      kind: "home",
    });
  });
});
