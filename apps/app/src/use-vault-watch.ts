import type { TaskManager } from "@taskmanager/core";
import { useEffect } from "react";
import { platform } from "./platform";

/**
 * Reconciles external Vault edits into Tasks and refreshes the UI whenever a
 * file under the Vault changes. Best-effort: if watching is unavailable the app
 * keeps working, it just does not pick up external edits live.
 */
export function useVaultWatch(core: TaskManager, onReconcile: () => void): void {
  useEffect(() => {
    let active = true;
    let unwatch: (() => void) | null = null;

    core
      .getVaultPath()
      .then((path) => {
        if (!active || path === null) {
          return;
        }
        return platform.watchVault(path, () => {
          void core.reconcileVault().then(() => {
            if (active) {
              onReconcile();
            }
          });
        });
      })
      .then((stop) => {
        if (active && stop !== undefined) {
          unwatch = stop;
        }
      })
      .catch(() => {
        // Watching is best-effort; ignore and keep the app usable.
      });

    return () => {
      active = false;
      if (unwatch !== null) {
        unwatch();
      }
    };
  }, [core, onReconcile]);
}
