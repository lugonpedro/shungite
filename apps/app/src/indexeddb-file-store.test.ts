import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createIndexedDBFileStore } from "./indexeddb-file-store";

let sequence = 0;

function uniqueDatabase(prefix: string): string {
  sequence += 1;
  return `taskmanager-${prefix}-${Date.now()}-${sequence}`;
}

describe("IndexedDB FileStore", () => {
  it("stores, reads, removes and lists Markdown files recursively", async () => {
    const store = createIndexedDBFileStore({
      databaseName: uniqueDatabase("file-store"),
    });

    await expect(store.read("/vault/Missing.md")).resolves.toBeNull();
    await expect(store.exists("/vault/Missing.md")).resolves.toBe(false);

    await store.write("/vault/A.md", "# A");
    await store.write("/vault/Sub/B.md", "# B");
    await store.write("/vault/Sub/notes.txt", "not a Note");
    await store.write("/vault/Empty.md", "");

    await expect(store.exists("/vault/A.md")).resolves.toBe(true);
    await expect(store.read("/vault/A.md")).resolves.toBe("# A");
    await expect(store.read("/vault/Empty.md")).resolves.toBe("");
    await expect(store.list("/vault")).resolves.toEqual([
      "/vault/A.md",
      "/vault/Empty.md",
      "/vault/Sub/B.md",
    ]);
    await expect(store.list("/vault/Sub")).resolves.toEqual([
      "/vault/Sub/B.md",
    ]);

    await store.write("/vault/A.md", "# A edited");
    await expect(store.read("/vault/A.md")).resolves.toBe("# A edited");

    await store.remove("/vault/A.md");
    await expect(store.exists("/vault/A.md")).resolves.toBe(false);
    await expect(store.list("/vault")).resolves.toEqual([
      "/vault/Empty.md",
      "/vault/Sub/B.md",
    ]);
  });
});
