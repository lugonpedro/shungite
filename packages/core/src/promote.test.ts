import { describe, expect, it } from "vitest";
import {
  createTaskManager,
  type FileStore,
  type LocalStore,
  type Task,
} from "./index";

function createLocalStore(): LocalStore & {
  tasks: Map<string, Task>;
  vaultPath: string | null;
} {
  const tasks = new Map<string, Task>();
  const store = {
    tasks,
    vaultPath: null as string | null,
    async getTask(id: string) {
      return tasks.get(id) ?? null;
    },
    async getTasks() {
      return [...tasks.values()];
    },
    async saveTask(task: Task) {
      tasks.set(task.id, { ...task });
    },
    async getVaultPath() {
      return store.vaultPath;
    },
    async saveVaultPath(path: string | null) {
      store.vaultPath = path;
    },
  };
  return store;
}

function createFileStore(): FileStore & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, content) {
      files.set(path, content);
    },
    async remove(path) {
      files.delete(path);
    },
    async exists(path) {
      return files.has(path);
    },
  };
}

describe("promote", () => {
  it("creates a Note named after the Task with id, done and due in the frontmatter", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });
    await core.setVaultPath("/vault");

    const task = await core.createTask({
      text: "  Plan the trip  ",
      due: "2026-05-01",
    });
    const promoted = await core.promoteTask(task.id);

    expect(promoted.notePath).toBe("/vault/Plan the trip.md");
    expect(fileStore.files.get("/vault/Plan the trip.md")).toBe(
      `---\nid: ${task.id}\ndone: false\ndue: 2026-05-01\n---\n`,
    );
    await expect(core.getTask(task.id)).resolves.toMatchObject({
      notePath: "/vault/Plan the trip.md",
    });
  });

  it("writes an empty due when the Task has no due date", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });
    await core.setVaultPath("/vault");

    const task = await core.createTask({ text: "Buy milk" });
    await core.promoteTask(task.id);

    expect(fileStore.files.get("/vault/Buy milk.md")).toBe(
      `---\nid: ${task.id}\ndone: false\ndue:\n---\n`,
    );
  });

  it("rewrites the Note frontmatter when the Task is completed and keeps the free text", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });
    await core.setVaultPath("/vault");

    const task = await core.createTask({ text: "Write report", due: "2026-06-15" });
    await core.promoteTask(task.id);

    const path = "/vault/Write report.md";
    await fileStore.write(
      path,
      `---\nid: ${task.id}\ndone: false\ndue: 2026-06-15\n---\n\nNotes from the meeting\n\n- first point\n- second point\n`,
    );

    const completed = await core.setTaskDone(task.id, true);

    expect(completed.done).toBe(true);
    expect(fileStore.files.get(path)).toBe(
      `---\nid: ${task.id}\ndone: true\ndue: 2026-06-15\n---\n\nNotes from the meeting\n\n- first point\n- second point\n`,
    );

    await core.setTaskDone(task.id, false);

    expect(fileStore.files.get(path)).toBe(
      `---\nid: ${task.id}\ndone: false\ndue: 2026-06-15\n---\n\nNotes from the meeting\n\n- first point\n- second point\n`,
    );
  });

  it("renames the Note and keeps its body when the Task text changes", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });
    await core.setVaultPath("/vault");

    const task = await core.createTask({ text: "Old title", due: "2026-06-15" });
    await core.promoteTask(task.id);
    await fileStore.write(
      "/vault/Old title.md",
      `---\nid: ${task.id}\ndone: false\ndue: 2026-06-15\n---\n\nKeep me\n`,
    );

    const edited = await core.updateTask(task.id, { text: "New title" });

    expect(edited.notePath).toBe("/vault/New title.md");
    expect(fileStore.files.has("/vault/Old title.md")).toBe(false);
    expect(fileStore.files.get("/vault/New title.md")).toBe(
      `---\nid: ${task.id}\ndone: false\ndue: 2026-06-15\n---\n\nKeep me\n`,
    );
  });

  it("rewrites the Note frontmatter when the due date changes, keeping the body", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });
    await core.setVaultPath("/vault");

    const task = await core.createTask({ text: "Old title", due: "2026-06-15" });
    await core.promoteTask(task.id);
    await fileStore.write(
      "/vault/Old title.md",
      `---\nid: ${task.id}\ndone: false\ndue: 2026-06-15\n---\n\nKeep me\n`,
    );

    await core.updateTask(task.id, { due: "2026-12-01" });

    expect(fileStore.files.get("/vault/Old title.md")).toBe(
      `---\nid: ${task.id}\ndone: false\ndue: 2026-12-01\n---\n\nKeep me\n`,
    );

    await core.updateTask(task.id, { due: null });

    expect(fileStore.files.get("/vault/Old title.md")).toBe(
      `---\nid: ${task.id}\ndone: false\ndue:\n---\n\nKeep me\n`,
    );
  });

  it("uses a valid file name when the title has characters a folder cannot hold", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });
    await core.setVaultPath("/vault");

    const task = await core.createTask({ text: 'R&D: notes/ideas "' });
    const promoted = await core.promoteTask(task.id);

    expect(promoted.notePath).toBe("/vault/R&D notes ideas.md");
    expect(fileStore.files.has("/vault/R&D notes ideas.md")).toBe(true);
  });

  it("keeps a very long title inside a valid file name length", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });
    await core.setVaultPath("/vault");

    const task = await core.createTask({ text: "á".repeat(500) });
    const promoted = await core.promoteTask(task.id);
    const fileName = promoted.notePath?.split("/").at(-1) ?? "";

    expect(new TextEncoder().encode(fileName).length).toBeLessThanOrEqual(255);
    expect(fileStore.files.has(promoted.notePath ?? "")).toBe(true);
  });

  it("rewrites the same Note on a second Promote and keeps its body", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });
    await core.setVaultPath("/vault");

    const task = await core.createTask({ text: "Write report" });
    const first = await core.promoteTask(task.id);
    await fileStore.write(
      "/vault/Write report.md",
      `---\nid: ${task.id}\ndone: false\ndue:\n---\n\nBody stays\n`,
    );

    const second = await core.promoteTask(task.id);

    expect(second.notePath).toBe(first.notePath);
    expect(fileStore.files.get("/vault/Write report.md")).toBe(
      `---\nid: ${task.id}\ndone: false\ndue:\n---\n\nBody stays\n`,
    );
  });

  it("does not overwrite another Task's Note when two titles collide", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });
    await core.setVaultPath("/vault");

    const first = await core.createTask({ text: "Same title" });
    const second = await core.createTask({ text: "Same title" });

    const firstPromoted = await core.promoteTask(first.id);
    const secondPromoted = await core.promoteTask(second.id);

    expect(firstPromoted.notePath).toBe("/vault/Same title.md");
    expect(secondPromoted.notePath).toBe("/vault/Same title (2).md");
    expect(fileStore.files.get("/vault/Same title.md")).toContain(
      `id: ${first.id}`,
    );
    expect(fileStore.files.get("/vault/Same title (2).md")).toContain(
      `id: ${second.id}`,
    );
  });

  it("gives every Task a UUID v7", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });

    const task = await core.createTask({ text: "Buy milk" });

    expect(task.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("vault", () => {
  it("asks for the vault before the first Promote and remembers the choice", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const core = createTaskManager({ localStore, fileStore });

    await expect(core.getVaultPath()).resolves.toBeNull();

    const task = await core.createTask({ text: "Plan the trip" });
    await expect(core.promoteTask(task.id)).rejects.toMatchObject({
      code: "vault-required",
    });

    await core.setVaultPath("/vault");

    await expect(core.getVaultPath()).resolves.toBe("/vault");

    const reopened = createTaskManager({ localStore, fileStore });
    await expect(reopened.getVaultPath()).resolves.toBe("/vault");
  });
});
