import "fake-indexeddb/auto";
import type { Task } from "@shungite/core";
import { describe, expect, it } from "vitest";
import { platform } from "./web";

describe("web platform", () => {
  it("wires the IndexedDB adapters and never owns a Vault", async () => {
    expect(platform.canChooseVault).toBe(false);
    await expect(platform.defaultVaultPath()).resolves.toBe("/vault");
    await expect(platform.chooseVaultFolder()).resolves.toBeNull();

    const stop = await platform.watchVault("/vault", () => {});
    expect(typeof stop).toBe("function");
    stop();

    const localStore = await platform.createLocalStore();
    const task: Task = {
      id: "platform-task",
      text: "Persist me",
      done: false,
      due: null,
      version: 1,
      baseVersion: 0,
      deleted: false,
      createdAt: "2026-11-08T00:00:00.000Z",
      updatedAt: "2026-11-08T00:00:00.000Z",
      notePath: null,
    };
    await localStore.saveTask(task);
    await expect(localStore.getTask(task.id)).resolves.toEqual(task);

    const fileStore = platform.createFileStore();
    await fileStore.write("/vault/Platform.md", "# Platform");
    await expect(fileStore.read("/vault/Platform.md")).resolves.toBe(
      "# Platform",
    );
  });
});
