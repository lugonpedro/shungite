import type { TaskManager } from "@taskmanager/core";
import { useEffect } from "react";

const SYNC_INTERVAL_MS = 15_000;

/**
 * Runs Sync on start and periodically while the app is signed in. Best-effort:
 * a failed sync is swallowed so a flaky network never breaks the local app.
 * After local changes, `App` calls `core.sync()` directly (a no-op without a
 * RemoteStore), so this hook only owns the timer and the initial sync.
 */
export function useSync(core: TaskManager | null, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || core === null) {
      return;
    }

    let active = true;
    void core.sync().catch(() => {});

    const interval = setInterval(() => {
      if (active) {
        void core.sync().catch(() => {});
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [core, enabled]);
}
