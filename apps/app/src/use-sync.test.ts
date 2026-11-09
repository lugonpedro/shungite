import type { Shungite } from "@shungite/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSyncScheduler,
  nextRetryDelay,
  SYNC_BACKOFF_MS,
  SYNC_DEBOUNCE_MS,
  SYNC_INTERVAL_MS,
  syncLabel,
  useSync,
} from "./use-sync";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("createSyncScheduler", () => {
  it("waits for a second of silence and collapses a burst into one round", async () => {
    vi.useFakeTimers();
    const runs: number[] = [];
    const scheduler = createSyncScheduler(async () => {
      runs.push(Date.now());
    });

    scheduler.request();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS - 1);
    expect(runs).toHaveLength(0);

    // A new mutation restarts the quiet period instead of queuing a round.
    scheduler.request();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS - 1);
    expect(runs).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toHaveLength(1);

    scheduler.dispose();
  });

  it("never runs two rounds at once and reruns once when asked in flight", async () => {
    vi.useFakeTimers();
    const releases: Array<() => void> = [];
    const scheduler = createSyncScheduler(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );

    scheduler.request();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    expect(releases).toHaveLength(1);

    // Requests during the round must not start a second concurrent round.
    scheduler.request();
    scheduler.request();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS * 2);
    expect(releases).toHaveLength(1);

    releases[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(releases).toHaveLength(1);

    // The in-flight request marked one rerun, which starts after quiet again.
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    expect(releases).toHaveLength(2);

    scheduler.dispose();
  });

  it("stops scheduling after dispose", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {});
    const scheduler = createSyncScheduler(run);

    scheduler.request();
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS * 2);

    expect(run).not.toHaveBeenCalled();
  });
});

describe("syncLabel", () => {
  it("shows the last successful sync time in the synchronized label", () => {
    expect(syncLabel("on", new Date(2026, 0, 2, 9, 5))).toBe(
      "sincronizado às 09:05",
    );
    expect(syncLabel("on", new Date(2026, 11, 31, 23, 59))).toBe(
      "sincronizado às 23:59",
    );
  });

  it("falls back to the plain label before the first successful round", () => {
    expect(syncLabel("on")).toBe("sincronizado");
    expect(syncLabel("on", null)).toBe("sincronizado");
  });

  it("keeps the other states unchanged", () => {
    expect(syncLabel("off", new Date())).toBe("Sync desligado");
    expect(syncLabel("syncing", new Date())).toBe("sincronizando…");
    expect(syncLabel("error", new Date())).toBe("Sync com erro");
  });
});

describe("retry backoff", () => {
  it("grows from 15 s to 5 min and then stays at 5 min", () => {
    expect(SYNC_BACKOFF_MS).toEqual([15_000, 30_000, 60_000, 300_000]);
    expect(nextRetryDelay(1)).toBe(15_000);
    expect(nextRetryDelay(2)).toBe(30_000);
    expect(nextRetryDelay(3)).toBe(60_000);
    expect(nextRetryDelay(4)).toBe(300_000);
    expect(nextRetryDelay(20)).toBe(300_000);
  });
});

interface FakeCore {
  core: Shungite;
  sync: ReturnType<typeof vi.fn>;
  hasPendingSync: ReturnType<typeof vi.fn>;
}

function fakeCore(
  overrides: {
    sync?: () => Promise<void>;
    hasPendingSync?: () => Promise<boolean>;
  } = {},
): FakeCore {
  const sync = vi.fn(overrides.sync ?? (async () => {}));
  const hasPendingSync = vi.fn(overrides.hasPendingSync ?? (async () => false));
  const core = { sync, hasPendingSync } as unknown as Shungite;
  return { core, sync, hasPendingSync };
}

/** Shadows the read-only `document.visibilityState` for one test. */
function setVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
}

describe("useSync pause and retry", () => {
  it("pauses polling while hidden and syncs once when visible again", async () => {
    vi.useFakeTimers();
    const { core, sync } = fakeCore();
    setVisibility("visible");

    renderHook(() => useSync(core, true));
    // The initial round is not a poll and always runs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    });
    expect(sync).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    });
    expect(sync).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    });
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("asks for one round when the network comes back online", async () => {
    vi.useFakeTimers();
    const { core, sync } = fakeCore();
    setVisibility("visible");

    renderHook(() => useSync(core, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    });
    expect(sync).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    });
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("backs off on errors and does not blink to syncing during a retry", async () => {
    vi.useFakeTimers();
    let resolveRetry: (() => void) | null = null;
    let rejectFirst = true;
    const { core, sync } = fakeCore({
      hasPendingSync: async () => true,
      sync: () => {
        if (rejectFirst) {
          rejectFirst = false;
          return Promise.reject(new Error("offline"));
        }
        return new Promise<void>((resolve) => {
          resolveRetry = resolve;
        });
      },
    });
    setVisibility("visible");

    const { result } = renderHook(() => useSync(core, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("offline");

    // Nothing retries before the first 15 s backoff elapses.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(nextRetryDelay(1) - 1);
    });
    expect(sync).toHaveBeenCalledTimes(1);

    // After the backoff (plus the 1 s debounce) the retry starts, but the
    // indicator stays on "error", never "syncing".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1 + SYNC_DEBOUNCE_MS);
    });
    expect(sync).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("error");

    await act(async () => {
      resolveRetry?.();
      await Promise.resolve();
    });
    expect(result.current.state).toBe("on");
    expect(result.current.error).toBeNull();
  });
});
