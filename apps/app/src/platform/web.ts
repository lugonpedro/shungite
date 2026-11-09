import type { LocalStore } from "@taskmanager/core";
import type { Platform } from "./types";

const NOT_IMPLEMENTED = "não implementado";

function notImplemented(): Promise<never> {
  return Promise.reject(new Error(NOT_IMPLEMENTED));
}

/** Web platform stub; real IndexedDB adapters land in #29. */
export const platform: Platform = {
  target: "web",
  createLocalStore() {
    return notImplemented();
  },
  createFileStore() {
    throw new Error(NOT_IMPLEMENTED);
  },
  watchVault() {
    return notImplemented();
  },
  defaultVaultPath() {
    return notImplemented();
  },
  ensureVaultFolder() {
    return notImplemented();
  },
  chooseVaultFolder() {
    return notImplemented();
  },
  async provisionIOSVault(_localStore: LocalStore): Promise<void> {
    // No iOS sandbox Vault on the web build.
  },
};
