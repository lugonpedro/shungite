import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSyncScheduler,
  SYNC_DEBOUNCE_MS,
  syncLabel,
} from "./use-sync";

afterEach(() => {
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
