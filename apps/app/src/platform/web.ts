import type { Platform } from "./types";

const NOT_IMPLEMENTED = "não implementado";

/** Web platform stub; real IndexedDB adapters land in #29. */
export const platform: Platform = {
  createLocalStore() {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  },
  createFileStore() {
    throw new Error(NOT_IMPLEMENTED);
  },
  watchVault() {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  },
  defaultVaultPath() {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  },
  ensureVaultFolder() {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  },
  chooseVaultFolder() {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  },
};
