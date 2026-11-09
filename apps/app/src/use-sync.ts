import type { TaskManager } from "@taskmanager/core";
import { useEffect, useState } from "react";

const SYNC_INTERVAL_MS = 15_000;

/**
 * "off" when Sync is not configured/signed in, "syncing" while a round is
 * running, "on" after the latest round succeeded and "error" when it failed.
 */
export type SyncState = "off" | "syncing" | "on" | "error";

/**
 * Runs Sync on start and periodically while the app is signed in. A failed
 * sync never breaks the local app; it only shows up in the Sync state.
 * After local changes, `App` calls `core.sync()` directly (a no-op without a
 * RemoteStore), so this hook owns the timer and the initial sync.
 */
export function useSync(core: TaskManager | null, enabled: boolean): SyncState {
  const [state, setState] = useState<SyncState>(enabled ? "syncing" : "off");

  useEffect(() => {
    if (!enabled || core === null) {
      setState("off");
      return;
    }

    let active = true;
    const manager = core;

    async function round(): Promise<void> {
      setState("syncing");
      try {
        await manager.sync();
        if (active) {
          setState("on");
        }
      } catch {
        if (active) {
          setState("error");
        }
      }
    }

    void round();
    const interval = setInterval(() => {
      if (active) {
        void round();
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [core, enabled]);

  return state;
}

/** The short Portuguese label for a Sync state, shared by the UI. */
export function syncLabel(state: SyncState): string {
  switch (state) {
    case "off":
      return "Sync desligado";
    case "syncing":
      return "sincronizando…";
    case "on":
      return "sincronizado";
    case "error":
      return "Sync com erro";
  }
}
