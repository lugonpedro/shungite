import { describe, expect, it } from "vitest";
import { createTaskManager } from "./index";
import { parseNote } from "./note";
import {
  createMemoryFileStore as createFileStore,
  createMemoryLocalStore as createLocalStore,
} from "./test-support";

function setup() {
  const localStore = createLocalStore();
  const fileStore = createFileStore();
  const core = createTaskManager({ localStore, fileStore });
  return { core, localStore, fileStore };
}

/** A fixed clock so the reconcile's `updatedAt` is deterministic. */
const CLOCK = new Date("2026-11-08T10:00:00.000Z");

function withClock() {
  const localStore = createLocalStore();
  const fileStore = createFileStore();
  const core = createTaskManager({ localStore, fileStore, now: () => CLOCK });
  return { core, localStore, fileStore };
}

async function promote(
  core: ReturnType<typeof createTaskManager>,
  text: string,
  due: string | null = null,
) {
  await core.setVaultPath("/vault");
  const task = await core.createTask({ text, due });
  return core.promoteTask(task.id);
}

describe("reconcileVault", () => {
  it("updates the Task when `done` and `due` change in the frontmatter outside the app", async () => {
    const { core, fileStore } = setup();
    const task = await promote(core, "Write report", "2026-06-15");

    const path = "/vault/Write report.md";
    await fileStore.write(
      path,
      `---\nid: ${task.id}\ndone: true\ndue: 2026-07-01\n---\n\nBody\n`,
    );

    const result = await core.reconcileVault();

    expect(result.changed.map((t) => t.id)).toEqual([task.id]);
    await expect(core.getTask(task.id)).resolves.toMatchObject({
      done: true,
      due: "2026-07-01",
      notePath: path,
    });
  });

  it("updates the Task title when the Note is renamed outside the app", async () => {
    const { core, fileStore } = setup();
    const task = await promote(core, "Old title", "2026-06-15");

    await fileStore.remove("/vault/Old title.md");
    await fileStore.write(
      "/vault/New title.md",
      `---\nid: ${task.id}\ndone: false\ndue: 2026-06-15\n---\n\nKeep me\n`,
    );

    const result = await core.reconcileVault();

    expect(result.changed.map((t) => t.id)).toEqual([task.id]);
    await expect(core.getTask(task.id)).resolves.toMatchObject({
      text: "New title",
      notePath: "/vault/New title.md",
    });
  });

  it("undoes the Promote but keeps the Task when the `.md` is deleted outside the app", async () => {
    const { core, fileStore, localStore } = setup();
    const task = await promote(core, "Buy milk", "2026-05-01");

    await fileStore.remove("/vault/Buy milk.md");

    const result = await core.reconcileVault();

    expect(result.demoted).toBe(1);
    expect(result.changed.map((t) => t.id)).toEqual([task.id]);
    await expect(core.getTask(task.id)).resolves.toMatchObject({
      id: task.id,
      text: "Buy milk",
      done: false,
      due: "2026-05-01",
      notePath: null,
    });
    // The Task is kept, not deleted.
    expect(localStore.tasks.get(task.id)).toMatchObject({ deleted: false });
  });

  it("never reads a `.md` without an `id` as a Task nor alters it", async () => {
    const { core, fileStore } = setup();
    await promote(core, "Real note");

    const foreign = "---\ntitle: just some note\n---\n\nNot ours\n";
    await fileStore.write("/vault/Other note.md", foreign);

    const result = await core.reconcileVault();

    expect(result.ignored).toBe(1);
    // The foreign file is untouched.
    expect(fileStore.files.get("/vault/Other note.md")).toBe(foreign);
    // It never becomes a Task.
    await expect(core.listTasks()).resolves.toHaveLength(1);
  });

  it("reconciles Notes that live in subfolders of the Vault", async () => {
    const { core, fileStore } = setup();
    const task = await promote(core, "Plan the trip", "2026-06-15");

    await fileStore.remove("/vault/Plan the trip.md");
    await fileStore.write(
      "/vault/Trips/Plan the trip.md",
      `---\nid: ${task.id}\ndone: true\ndue: 2026-08-01\n---\n\nPacking list\n`,
    );

    const result = await core.reconcileVault();

    expect(result.changed.map((t) => t.id)).toEqual([task.id]);
    await expect(core.getTask(task.id)).resolves.toMatchObject({
      text: "Plan the trip",
      done: true,
      due: "2026-08-01",
      notePath: "/vault/Trips/Plan the trip.md",
    });
  });

  it("is a no-op when nothing changed outside the app", async () => {
    const { core } = withClock();
    const task = await promote(core, "Stable note", "2026-06-15");
    const versionBefore = task.version;

    const result = await core.reconcileVault();

    expect(result.changed).toEqual([]);
    expect(result.demoted).toBe(0);
    await expect(core.getTask(task.id)).resolves.toMatchObject({
      version: versionBefore,
    });
  });

  it("bumps the Task version when an external edit is reconciled", async () => {
    const { core, fileStore } = withClock();
    const task = await promote(core, "Versioned note", "2026-06-15");

    await fileStore.write(
      "/vault/Versioned note.md",
      `---\nid: ${task.id}\ndone: true\ndue: 2026-06-15\n---\n`,
    );

    await core.reconcileVault();

    await expect(core.getTask(task.id)).resolves.toMatchObject({
      done: true,
      version: task.version + 1,
      updatedAt: CLOCK.toISOString(),
    });
  });

  it("does not touch a Task whose Note still matches", async () => {
    const { core, fileStore } = setup();
    const task = await promote(core, "Write report", "2026-06-15");
    await fileStore.write(
      "/vault/Write report.md",
      `---\nid: ${task.id}\ndone: false\ndue: 2026-06-15\n---\n\nBody\n`,
    );

    const result = await core.reconcileVault();

    expect(result.changed).toEqual([]);
    await expect(core.getTask(task.id)).resolves.toMatchObject({
      text: "Write report",
      notePath: "/vault/Write report.md",
    });
  });

  it("ignores a `.md` whose `id` does not match any Task", async () => {
    const { core, fileStore } = setup();
    await promote(core, "Real note");

    await fileStore.write(
      "/vault/Orphan.md",
      "---\nid: 00000000-0000-7000-8000-000000000000\ndone: false\ndue:\n---\n\nOrphan\n",
    );

    const result = await core.reconcileVault();

    expect(result.changed).toEqual([]);
    await expect(core.listTasks()).resolves.toHaveLength(1);
  });

  it("keeps the free-form body when the frontmatter change is reconciled back to the app", async () => {
    const { core, fileStore } = setup();
    const task = await promote(core, "Write report", "2026-06-15");
    const path = "/vault/Write report.md";
    await fileStore.write(
      path,
      `---\nid: ${task.id}\ndone: false\ndue: 2026-06-15\n---\n\nBody to preserve\n`,
    );

    await core.reconcileVault();
    await core.setTaskDone(task.id, true);

    // Rewriting after a reconcile must not lose the body.
    expect(parseNote(fileStore.files.get(path) ?? "")?.body).toBe(
      "Body to preserve\n",
    );
  });
});
