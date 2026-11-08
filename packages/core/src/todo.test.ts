import { describe, expect, it } from "vitest";
import { createTaskManager } from "./index";
import { createMemoryFileStore, createMemoryLocalStore } from "./test-support";

function setup() {
  const localStore = createMemoryLocalStore();
  const fileStore = createMemoryFileStore();
  const core = createTaskManager({ localStore, fileStore });
  return { core, localStore, fileStore };
}

describe("To-Do Tasks", () => {
  it("creates a Task with only its text and writes no file", async () => {
    const { core, fileStore } = setup();

    const task = await core.createTask({ text: "  Buy milk  " });

    expect(task).toMatchObject({
      text: "Buy milk",
      done: false,
      due: null,
      deleted: false,
      notePath: null,
      version: 1,
    });
    expect(fileStore.files.size).toBe(0);
    await expect(core.listTasks()).resolves.toEqual([task]);
  });

  it("creates a Task with an optional due day", async () => {
    const { core } = setup();

    const task = await core.createTask({
      text: "Plan the trip",
      due: "2026-05-01",
    });

    expect(task.due).toBe("2026-05-01");
  });

  it("rejects a Task without text", async () => {
    const { core } = setup();

    await expect(core.createTask({ text: "   " })).rejects.toMatchObject({
      code: "empty-task-text",
    });
  });

  it("marks and unmarks a Task as done", async () => {
    const { core } = setup();
    const task = await core.createTask({ text: "Buy milk" });

    const done = await core.setTaskDone(task.id, true);
    expect(done.done).toBe(true);
    await expect(core.getTask(task.id)).resolves.toMatchObject({ done: true });

    const undone = await core.setTaskDone(task.id, false);
    expect(undone.done).toBe(false);
  });

  it("edits the text of a Task", async () => {
    const { core } = setup();
    const task = await core.createTask({ text: "Buy milk" });

    const edited = await core.updateTask(task.id, { text: "  Buy oat milk " });

    expect(edited.text).toBe("Buy oat milk");
    await expect(core.getTask(task.id)).resolves.toMatchObject({
      text: "Buy oat milk",
    });
  });

  it("sets and removes the due day", async () => {
    const { core } = setup();
    const task = await core.createTask({ text: "Buy milk" });

    const withDue = await core.updateTask(task.id, { due: "2026-07-01" });
    expect(withDue.due).toBe("2026-07-01");

    const withoutDue = await core.updateTask(task.id, { due: null });
    expect(withoutDue.due).toBeNull();
  });

  it("deletes a Task so it leaves the To-Do list", async () => {
    const { core, localStore } = setup();
    const task = await core.createTask({ text: "Buy milk" });
    const other = await core.createTask({ text: "Walk the dog" });

    await core.deleteTask(task.id);

    await expect(core.listTasks()).resolves.toEqual([other]);
    await expect(core.getTask(task.id)).resolves.toBeNull();
    expect(localStore.tasks.get(task.id)).toMatchObject({ deleted: true });
  });

  it("removes the Note of a promoted Task when the Task is deleted", async () => {
    const { core, fileStore } = setup();
    await core.setVaultPath("/vault");
    const task = await core.createTask({ text: "Buy milk" });
    await core.promoteTask(task.id);

    await core.deleteTask(task.id);

    expect(fileStore.files.has("/vault/Buy milk.md")).toBe(false);
    await expect(core.listTasks()).resolves.toEqual([]);
  });

  it("reports a missing Task when deleting it", async () => {
    const { core } = setup();

    await expect(core.deleteTask("missing")).rejects.toMatchObject({
      code: "task-not-found",
    });
  });

  it("gives every Task a UUID v7", async () => {
    const { core } = setup();

    const task = await core.createTask({ text: "Buy milk" });

    expect(task.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("keeps a deleted Task deleted after the app is reopened", async () => {
    const localStore = createMemoryLocalStore();
    const fileStore = createMemoryFileStore();
    const firstRun = createTaskManager({ localStore, fileStore });
    const task = await firstRun.createTask({ text: "Buy milk" });
    await firstRun.deleteTask(task.id);

    const reopened = createTaskManager({ localStore, fileStore });

    await expect(reopened.listTasks()).resolves.toEqual([]);
    await expect(reopened.getTask(task.id)).resolves.toBeNull();
  });

  it("keeps Tasks after the app is closed and reopened", async () => {
    const localStore = createMemoryLocalStore();
    const fileStore = createMemoryFileStore();
    const firstRun = createTaskManager({ localStore, fileStore });
    const task = await firstRun.createTask({
      text: "Persist me",
      due: "2026-08-01",
    });
    await firstRun.setTaskDone(task.id, true);

    const reopened = createTaskManager({ localStore, fileStore });

    await expect(reopened.listTasks()).resolves.toMatchObject([
      { id: task.id, text: "Persist me", due: "2026-08-01", done: true },
    ]);
  });
});
