import { describe, expect, it } from "vitest";
import {
  createShungite,
  type VaultTree,
  type VaultTreeEntry,
  type VaultTreeFolder,
  type VaultTreeNote,
} from "./index";
import {
  createMemoryFileStore as createFileStore,
  createMemoryLocalStore as createLocalStore,
} from "./test-support";

function setup() {
  const localStore = createLocalStore();
  const fileStore = createFileStore();
  const core = createShungite({ localStore, fileStore });
  return { core, localStore, fileStore };
}

function names(entries: VaultTreeEntry[]): string[] {
  return entries.map((entry) => entry.name);
}

function findNote(
  entries: VaultTreeEntry[],
  name: string,
): VaultTreeNote | undefined {
  for (const entry of entries) {
    if (entry.kind === "note" && entry.name === name) {
      return entry;
    }
    if (entry.kind === "folder") {
      const found = findNote(entry.children, name);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

function folder(tree: VaultTree, name: string): VaultTreeFolder {
  const entry = tree.entries.find(
    (candidate): candidate is VaultTreeFolder =>
      candidate.kind === "folder" && candidate.name === name,
  );
  if (entry === undefined) {
    throw new Error(`Folder not found: ${name}`);
  }
  return entry;
}

describe("listVaultTree", () => {
  it("turns Vault paths into a folder tree with the files inside them", async () => {
    const { core, fileStore } = setup();
    await core.setVaultPath("/vault");
    await fileStore.write("/vault/Root.md", "root");
    await fileStore.write("/vault/Trips/Plan.md", "trip");
    await fileStore.write("/vault/Trips/2026/Summer.md", "summer");
    await fileStore.write("/vault/Work/Report.md", "report");

    const tree = await core.listVaultTree();

    expect(tree).not.toBeNull();
    expect(tree?.path).toBe("/vault");
    expect(names(tree?.entries ?? [])).toEqual(["Trips", "Work", "Root"]);
    expect(names(folder(tree as VaultTree, "Trips").children)).toEqual([
      "2026",
      "Plan",
    ]);
    expect(
      names(
        (
          folder(tree as VaultTree, "Trips").children[0] as VaultTreeFolder
        ).children,
      ),
    ).toEqual(["Summer"]);
  });

  it("sorts folders first and then files, alphabetically and case-insensitively", async () => {
    const { core, fileStore } = setup();
    await core.setVaultPath("/vault");
    await fileStore.write("/vault/Zebra.md", "z");
    await fileStore.write("/vault/aardvark.md", "a");
    await fileStore.write("/vault/beta/One.md", "1");
    await fileStore.write("/vault/Alpha/Two.md", "2");

    const tree = await core.listVaultTree();

    expect(names(tree?.entries ?? [])).toEqual([
      "Alpha",
      "beta",
      "aardvark",
      "Zebra",
    ]);
  });

  it("shows the file name without the `.md` extension", async () => {
    const { core, fileStore } = setup();
    await core.setVaultPath("/vault");
    await fileStore.write("/vault/Plan the trip.md", "any");

    const tree = await core.listVaultTree();

    expect(names(tree?.entries ?? [])).toEqual(["Plan the trip"]);
  });

  it("flags a `.md` without an `id` as unmanaged and never reads its content", async () => {
    const localStore = createLocalStore();
    const fileStore = createFileStore();
    const reads: string[] = [];
    const readFile = fileStore.read.bind(fileStore);
    fileStore.read = async (path) => {
      reads.push(path);
      return readFile(path);
    };
    const core = createShungite({ localStore, fileStore });
    await core.setVaultPath("/vault");
    await fileStore.write(
      "/vault/Foreign.md",
      "---\ntitle: someone else's note\n---\n\nDo not touch\n",
    );

    const tree = await core.listVaultTree();

    expect(reads).toEqual([]);
    expect(findNote(tree?.entries ?? [], "Foreign")).toMatchObject({
      managed: false,
      conflict: false,
    });
    // Clicking an unmanaged file opens nothing and still reads nothing.
    await expect(core.readNote("/vault/Foreign.md")).resolves.toBeNull();
    expect(reads).toEqual([]);
  });

  it("flags a Conflict copy and still lets it be read like any Note", async () => {
    const { core, fileStore } = setup();
    await core.setVaultPath("/vault");
    const task = await core.createTask({ text: "Plan (conflito)" });
    await core.promoteTask(task.id);

    const tree = await core.listVaultTree();

    const conflict = findNote(tree?.entries ?? [], "Plan (conflito)");
    expect(conflict).toMatchObject({ managed: true, conflict: true });
    await expect(
      core.readNote("/vault/Plan (conflito).md"),
    ).resolves.toMatchObject({ title: "Plan (conflito)" });
  });

  it("marks a promoted Note as managed and reads its body only on demand", async () => {
    const { core, fileStore } = setup();
    await core.setVaultPath("/vault");
    const task = await core.createTask({
      text: "Plan the trip",
      due: "2026-06-15",
    });
    await core.promoteTask(task.id);
    await fileStore.write(
      "/vault/Plan the trip.md",
      `---\nid: ${task.id}\ndone: false\ndue: 2026-06-15\n---\n\nPacking list\n\n- passport\n`,
    );

    const tree = await core.listVaultTree();

    expect(findNote(tree?.entries ?? [], "Plan the trip")).toMatchObject({
      managed: true,
      conflict: false,
    });

    await expect(core.readNote("/vault/Plan the trip.md")).resolves.toEqual({
      path: "/vault/Plan the trip.md",
      title: "Plan the trip",
      body: "Packing list\n\n- passport\n",
      done: false,
      due: "2026-06-15",
    });
  });

  it("keeps a Note managed after it moves to a subfolder and is reconciled", async () => {
    const { core, fileStore } = setup();
    await core.setVaultPath("/vault");
    const task = await core.createTask({ text: "Plan the trip" });
    await core.promoteTask(task.id);

    await fileStore.remove("/vault/Plan the trip.md");
    await fileStore.write(
      "/vault/Trips/Plan the trip.md",
      `---\nid: ${task.id}\ndone: false\ndue:\n---\n\nBody\n`,
    );
    await core.reconcileVault();

    const tree = await core.listVaultTree();

    expect(
      findNote(folder(tree as VaultTree, "Trips").children, "Plan the trip"),
    ).toMatchObject({ managed: true, path: "/vault/Trips/Plan the trip.md" });
    await expect(
      core.readNote("/vault/Trips/Plan the trip.md"),
    ).resolves.toMatchObject({ title: "Plan the trip", body: "Body\n" });
  });

  it("returns an empty tree for a Vault with no `.md` files", async () => {
    const { core } = setup();
    await core.setVaultPath("/vault");

    const tree = await core.listVaultTree();

    expect(tree).toEqual({ path: "/vault", entries: [] });
  });

  it("returns null when no Vault has been chosen yet", async () => {
    const { core } = setup();

    await expect(core.listVaultTree()).resolves.toBeNull();
    await expect(core.readNote("/vault/Anything.md")).resolves.toBeNull();
  });

  it("ignores files that are not `.md`", async () => {
    const { core, fileStore } = setup();
    await core.setVaultPath("/vault");
    await fileStore.write("/vault/Image.png", "not markdown");
    await fileStore.write("/vault/Note.md", "any");

    const tree = await core.listVaultTree();

    expect(names(tree?.entries ?? [])).toEqual(["Note"]);
  });
});
