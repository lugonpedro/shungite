import type { Shungite } from "@shungite/core";
import { useCallback, useEffect, useRef, useState } from "react";

/** How often an idle app asks for a Sync round. */
export const SYNC_INTERVAL_MS = 15_000;
/** Quiet period after a local change before the Sync round starts. */
export const SYNC_DEBOUNCE_MS = 1_000;

/**
 * "off" when Sync is not configured/signed in, "syncing" while a round with
 * real work is running, "on" after the latest round succeeded and "error" when
 * it failed.
 */
export type SyncState = "off" | "syncing" | "on" | "error";

export interface SyncScheduler {
  /** Asks for a round after the debounce delay; repeated calls reset it. */
  request(): void;
  /** Stops pending timers. A round already in flight still finishes. */
  dispose(): void;
}

/**
 * A single-flight, debounced Sync scheduler. Requests during the quiet period
 * collapse into one round; a request that arrives while a round is in flight
 * marks one extra round to run when the current one finishes.
 */
export function createSyncScheduler(
  run: () => Promise<void>,
  options: { debounceMs?: number } = {},
): SyncScheduler {
  const debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let rerun = false;
  let disposed = false;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(): void {
    if (disposed) {
      return;
    }
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void start();
    }, debounceMs);
  }

  async function start(): Promise<void> {
    if (disposed) {
      return;
    }
    if (running) {
      rerun = true;
      return;
    }

    running = true;
    try {
      await run();
    } catch {
      // The caller owns error display; keep the scheduler alive for retries.
    } finally {
      running = false;
      if (rerun && !disposed) {
        rerun = false;
        schedule();
      } else if (disposed) {
        rerun = false;
      }
    }
  }

  return {
    request() {
      if (disposed) {
        return;
      }
      if (running) {
        // Single-flight: never start a second concurrent round; run again
        // once the current one settles.
        rerun = true;
        return;
      }
      schedule();
    },
    dispose() {
      disposed = true;
      rerun = false;
      clearTimer();
    },
  };
}

export interface SyncStatus {
  state: SyncState;
  /** When the last successful round finished, or null before the first one. */
  lastSyncedAt: Date | null;
  /** Debounced, single-flight request to run Sync (no-op when signed out). */
  requestSync(): void;
}

/**
 * Runs Sync on start and periodically while the app is signed in. A failed
 * sync never breaks the local app; it only shows up in the Sync state.
 *
 * Local mutations call `requestSync()` too, so a change is pushed after a
 * short quiet period instead of once per mutation. Idle polling still runs,
 * but does not flip the indicator to "syncing" when this device has nothing
 * to send: only rounds with pending changes (or the initial round) announce
 * themselves.
 */
export function useSync(core: Shungite | null, enabled: boolean): SyncStatus {
  const [state, setState] = useState<SyncState>(enabled ? "syncing" : "off");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const schedulerRef = useRef<SyncScheduler | null>(null);

  useEffect(() => {
    if (!enabled || core === null) {
      setState("off");
      return;
    }

    let active = true;
    let firstRound = true;
    const manager = core;

    const scheduler = createSyncScheduler(async () => {
      let pending = false;
      try {
        pending = await manager.hasPendingSync();
      } catch {
        // If the local check fails, fall back to doing the round quietly.
        pending = false;
      }
      if (!active) {
        return;
      }

      // The first round may pull remote work, so it always shows activity.
      // Later polls only announce themselves when this device has changes.
      if (pending || firstRound) {
        setState("syncing");
      }

      try {
        await manager.sync();
        if (active) {
          setState("on");
          setLastSyncedAt(new Date());
        }
      } catch {
        if (active) {
          setState("error");
        }
      } finally {
        firstRound = false;
      }
    });

    schedulerRef.current = scheduler;
    scheduler.request();
    const interval = setInterval(() => scheduler.request(), SYNC_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
      scheduler.dispose();
      if (schedulerRef.current === scheduler) {
        schedulerRef.current = null;
      }
    };
  }, [core, enabled]);

  const requestSync = useCallback(() => {
    schedulerRef.current?.request();
  }, []);

  return { state, lastSyncedAt, requestSync };
}

/** Local clock as `HH:MM`, the form shown next to "sincronizado". */
function clockTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** The short Portuguese label for a Sync state, shared by the UI. */
export function syncLabel(
  state: SyncState,
  lastSyncedAt: Date | null = null,
): string {
  switch (state) {
    case "off":
      return "Sync desligado";
    case "syncing":
      return "sincronizando…";
    case "on":
      return lastSyncedAt === null
        ? "sincronizado"
        : `sincronizado às ${clockTime(lastSyncedAt)}`;
    case "error":
      return "Sync com erro";
  }
}
