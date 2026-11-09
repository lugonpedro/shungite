import { describe, expect, it, vi } from "vitest";
import { createSupabaseRemoteStore } from "./supabase-remote-store";

type SupabaseClientArg = Parameters<typeof createSupabaseRemoteStore>[0];

interface FakeRow {
  id: string;
  updated_at: string;
}

function fakeClient() {
  const getUser = vi.fn();
  const upsert = vi.fn(async () => ({ error: null }));
  const client = {
    auth: { getUser },
    from: vi.fn(() => ({ upsert })),
  } as unknown as SupabaseClientArg;
  return { client, getUser, upsert };
}

/** A read-only fake for `select("*")` and the optional `.gt` cursor filter. */
function fakeReadClient(rows: FakeRow[]) {
  const gt = vi.fn();
  const select = vi.fn();
  let since: string | undefined;

  const builder = {
    gt: vi.fn((column: string, value: string) => {
      gt(column, value);
      since = value;
      return builder;
    }),
    then<TResult>(
      resolve: (value: { data: FakeRow[]; error: null }) => TResult,
    ): Promise<TResult> {
      const data = rows.filter(
        (row) => since === undefined || row.updated_at > since,
      );
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };

  select.mockImplementation(() => builder);
  const from = vi.fn(() => ({ select }));
  const client = { from } as unknown as SupabaseClientArg;
  return { client, from, select, gt };
}

describe("createSupabaseRemoteStore", () => {
  it("uses the injected user id instead of calling auth.getUser() per write", async () => {
    const { client, getUser, upsert } = fakeClient();
    const store = createSupabaseRemoteStore(client, "user-1");

    await store.upsertTask({
      id: "task-1",
      title: "Buy milk",
      done: false,
      due: null,
      version: 1,
      deleted: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await store.registerDevice({
      id: "device-1",
      name: "Mac",
      kind: "home",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(getUser).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "task-1", user_id: "user-1" }),
    );
    expect(upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "device-1", user_id: "user-1" }),
    );
    // The server clock owns `updated_at`, which the incremental cursor uses.
    const upsertCalls = upsert.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    expect(upsertCalls[0]?.[0]).not.toHaveProperty("updated_at");
  });

  it("filters tasks and notes by the updated_at cursor when one is given", async () => {
    const rows: FakeRow[] = [
      { id: "old", updated_at: "2026-01-01T00:00:00.000Z" },
      { id: "new", updated_at: "2026-01-02T00:00:00.000Z" },
    ];
    const { client, from, gt } = fakeReadClient(rows);
    const store = createSupabaseRemoteStore(client, "user-1");

    expect(store.scope).toBe("user-1");

    // Without a cursor the first round reads everything.
    await expect(store.listTasks()).resolves.toHaveLength(2);
    expect(gt).not.toHaveBeenCalled();

    await expect(
      store.listTasks("2026-01-01T00:00:00.000Z"),
    ).resolves.toMatchObject([{ id: "new" }]);
    expect(gt).toHaveBeenLastCalledWith(
      "updated_at",
      "2026-01-01T00:00:00.000Z",
    );

    await expect(
      store.listNotes("2026-01-01T00:00:00.000Z"),
    ).resolves.toMatchObject([{ id: "new" }]);
    expect(gt).toHaveBeenLastCalledWith(
      "updated_at",
      "2026-01-01T00:00:00.000Z",
    );
    expect(from).toHaveBeenCalledWith("tasks");
    expect(from).toHaveBeenCalledWith("notes");
  });
});
