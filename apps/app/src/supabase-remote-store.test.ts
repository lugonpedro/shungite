import { describe, expect, it, vi } from "vitest";
import { createSupabaseRemoteStore } from "./supabase-remote-store";

type SupabaseClientArg = Parameters<typeof createSupabaseRemoteStore>[0];

function fakeClient() {
  const getUser = vi.fn();
  const upsert = vi.fn(async () => ({ error: null }));
  const client = {
    auth: { getUser },
    from: vi.fn(() => ({ upsert })),
  } as unknown as SupabaseClientArg;
  return { client, getUser, upsert };
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
  });
});
