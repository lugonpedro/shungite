import "fake-indexeddb/auto";
import {
  createTaskManager,
  type FileStore,
  type LocalStore,
  type TaskManager,
} from "@taskmanager/core";
import { describe, expect, it } from "vitest";
import { createIndexedDBFileStore } from "./indexeddb-file-store";
import { createIndexedDBLocalStore } from "./indexeddb-local-store";

const VAULT = "/vault";

let sequence = 0;

function uniqueDatabase(prefix: string): string {
  sequence += 1;
  return `taskmanager-${prefix}-${Date.now()}-${sequence}`;
}

interface Opened {
  core: TaskManager;
  localStore: LocalStore;
  fileStore: FileStore;
}

function open(databaseName: string): Opened {
  const localStore = createIndexedDBLocalStore({
    databaseName,
    vaultPath: VAULT,
  });
  const fileStore = createIndexedDBFileStore({ databaseName });
  return {
    core: createTaskManager({ localStore, fileStore }),
    localStore,
    fileStore,
  };
}

function setup(): Opened & { databaseName: string } {
  const databaseName = uniqueDatabase("local-store");
  return { databaseName, ...open(databaseName) };
}

describe("IndexedDB LocalStore", () => {
  it("persists a Task's creation, completion, edit and deletion", async () => {
    const { databaseName, core } = setup();
    const created = await core.createTask({
      text: "Buy milk",
      due: "2026-11-10",
    });

    // A fresh store instance proves the data is in IndexedDB, not memory.
    const reopened = open(databaseName);
    await expect(reopened.core.getTask(created.id)).resolves.toMatchObject({
      id: created.id,
      text: "Buy milk",
      done: false,
      due: "2026-11-10",
      deleted: false,
    });

    await reopened.core.setTaskDone(created.id, true);
    await reopened.core.updateTask(created.id, {
      text: "Buy oat milk",
      due: null,
    });

    const edited = open(databaseName);
    await expect(edited.core.getTask(created.id)).resolves.toMatchObject({
      id: created.id,
      text: "Buy oat milk",
      done: true,
      due: null,
      version: 3,
    });

    await edited.core.deleteTask(created.id);

    const deleted = open(databaseName);
    await expect(deleted.core.listTasks()).resolves.toEqual([]);
    await expect(
      deleted.localStore.getTask(created.id),
    ).resolves.toMatchObject({
      id: created.id,
      text: "Buy oat milk",
      done: true,
      deleted: true,
      notePath: null,
    });
  });

  it("persists a promoted Note and its later edits as records", async () => {
    const { databaseName, core } = setup();
    const task = await core.createTask({ text: "Plan trip" });
    const promoted = await core.promoteTask(task.id);

    expect(promoted.notePath).toBe("/vault/Plan trip.md");

    const first = open(databaseName);
    const note = await first.localStore.getNote(task.id);
    expect(note).toMatchObject({
      id: task.id,
      path: "Plan trip.md",
      deleted: false,
    });
    expect(note?.content).toContain(`id: ${task.id}`);
    await expect(first.fileStore.read("/vault/Plan trip.md")).resolves.toBe(
      note?.content,
    );

    // Editing the Task rewrites the Note, including a rename of its path.
    await first.core.updateTask(task.id, {
      text: "Plan summer trip",
      due: "2026-12-01",
    });
    await first.core.setTaskDone(task.id, true);

    const edited = open(databaseName);
    await expect(edited.localStore.getNote(task.id)).resolves.toMatchObject({
      id: task.id,
      path: "Plan summer trip.md",
      deleted: false,
      content: expect.stringContaining("done: true"),
    });
    await expect(edited.fileStore.exists("/vault/Plan trip.md")).resolves.toBe(
      false,
    );
    await expect(
      edited.fileStore.read("/vault/Plan summer trip.md"),
    ).resolves.toContain(`id: ${task.id}`);
    await expect(edited.core.getTask(task.id)).resolves.toMatchObject({
      notePath: "/vault/Plan summer trip.md",
    });
  });

  it("removes the Note file and records a tombstone when a Task is deleted", async () => {
    const { databaseName, core } = setup();
    const task = await core.createTask({ text: "Call Ana" });
    const promoted = await core.promoteTask(task.id);

    await core.deleteTask(task.id);

    const reopened = open(databaseName);
    await expect(
      reopened.fileStore.exists("/vault/Call Ana.md"),
    ).resolves.toBe(false);
    await expect(reopened.localStore.getNote(task.id)).resolves.toMatchObject({
      id: task.id,
      path: "Call Ana.md",
      content: "",
      deleted: true,
    });
    await expect(reopened.core.listTasks()).resolves.toEqual([]);
    expect(promoted.notePath).toBe("/vault/Call Ana.md");
  });

  it("persists the Vault path setting, including an explicit null", async () => {
    const { databaseName, localStore } = setup();

    await localStore.saveVaultPath("/custom/vault");
    await expect(
      createIndexedDBLocalStore({ databaseName }).getVaultPath(),
    ).resolves.toBe("/custom/vault");

    await localStore.saveVaultPath(null);
    await expect(
      createIndexedDBLocalStore({ databaseName }).getVaultPath(),
    ).resolves.toBeNull();
  });
});
