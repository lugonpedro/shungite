import { describe, expect, it } from "vitest";
import { createShungite, type Shungite } from "./index";
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
});
