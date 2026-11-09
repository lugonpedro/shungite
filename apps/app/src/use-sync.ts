import type { Shungite } from "@shungite/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Safety poll while the app is idle. Realtime events do the fast path; this
 * only catches a missed event or a Realtime outage (2 to 5 minutes).
 */
export const SYNC_INTERVAL_MS = 180_000;
/** Quiet period after a local change before the Sync round starts. */
export const SYNC_DEBOUNCE_MS = 1_000;

/**
 * Delays between failed rounds: 15 s, 30 s, 1 min, then 5 min forever. The
 * normal safety poll never shortens a backoff; a success resets it.
 */
export const SYNC_BACKOFF_MS = [15_000, 30_000, 60_000, 300_000] as const;

/** The delay before the next round after `failures` consecutive failures. */
export function nextRetryDelay(failures: number): number {
  const index =
    Math.min(Math.max(failures, 1), SYNC_BACKOFF_MS.length) - 1;
  return SYNC_BACKOFF_MS[index]!;
}

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
  /** Message of the last failed round, or null after a success. */
  error: string | null;
  /** Debounced, single-flight request to run Sync (no-op when signed out). */
  requestSync(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True when the page is hidden (a background tab or minimized PWA). */
function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * Runs Sync on start, on Realtime changes, after local mutations and on a slow
 * safety poll. A failed sync never breaks the local app; it only shows up in
 * the Sync state, and retries back off (15 s, 30 s, 1 min, 5 min) without
 * blinking the indicator back to "syncing".
 *
 * While the page is hidden, polling and retries stop; becoming visible again
 * (or the network coming back) asks for one round. Idle polls do not flip the
 * indicator to "syncing" when this device has nothing to send: only rounds
 * with pending changes (or the initial round) announce themselves.
 */
export function useSync(
  core: Shungite | null,
  enabled: boolean,
  realtimeClient: SupabaseClient | null = null,
  realtimeUserId: string | null = null,
): SyncStatus {
  const [state, setState] = useState<SyncState>(enabled ? "syncing" : "off");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const schedulerRef = useRef<SyncScheduler | null>(null);

  useEffect(() => {
    if (!enabled || core === null) {
      setState("off");
      setError(null);
      return;
    }

    let active = true;
    let firstRound = true;
    let failures = 0;
    let retrying = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const manager = core;

    function clearRetry(): void {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    }

    function scheduleRetry(): void {
      clearRetry();
      const delay = nextRetryDelay(failures);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        // Backgrounded apps stay quiet; becoming visible retries immediately.
        if (!active || isHidden()) {
          return;
        }
        retrying = true;
        scheduler.request();
      }, delay);
    }

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
      // Later polls only announce themselves when this device has changes;
      // a retry never blinks the indicator to "syncing".
      if (!retrying && (pending || firstRound)) {
        setState("syncing");
      }

      try {
        await manager.sync();
        if (active) {
          failures = 0;
          clearRetry();
          setState("on");
          setError(null);
          setLastSyncedAt(new Date());
        }
      } catch (cause) {
        if (active) {
          failures += 1;
          setState("error");
          setError(errorMessage(cause));
          scheduleRetry();
        }
      } finally {
        firstRound = false;
        retrying = false;
      }
    });

    schedulerRef.current = scheduler;
    scheduler.request();

    // Safety poll, skipped while the page is hidden and while a backoff is in
    // charge of retrying a failed round.
    const interval = setInterval(() => {
      if (!isHidden() && failures === 0) {
        scheduler.request();
      }
    }, SYNC_INTERVAL_MS);

    function onVisibilityChange(): void {
      if (!isHidden()) {
        // Coming back to the foreground runs exactly one round.
        retrying = false;
        scheduler.request();
      }
    }

    function onOnline(): void {
      // The network is back: one round pushes anything queued while offline.
      scheduler.request();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    // Realtime: a row changed on another device wakes Sync right away. The
    // table must be in the `supabase_realtime` publication for this to fire;
    // the safety poll and local mutations still work without it.
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    if (realtimeClient !== null && realtimeUserId !== null) {
      channel = realtimeClient
        .channel(`sync:${realtimeUserId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
            filter: `user_id=eq.${realtimeUserId}`,
          },
          () => scheduler.request(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notes",
            filter: `user_id=eq.${realtimeUserId}`,
          },
          () => scheduler.request(),
        )
        .subscribe();
    }

    return () => {
      active = false;
      clearRetry();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      scheduler.dispose();
      if (channel !== null && realtimeClient !== null) {
        void realtimeClient.removeChannel(channel);
      }
      if (schedulerRef.current === scheduler) {
        schedulerRef.current = null;
      }
    };
  }, [core, enabled, realtimeClient, realtimeUserId]);

  const requestSync = useCallback(() => {
    schedulerRef.current?.request();
  }, []);

  return { state, lastSyncedAt, error, requestSync };
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
