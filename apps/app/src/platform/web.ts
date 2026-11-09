import type { LocalStore } from "@shungite/core";
import { createIndexedDBFileStore } from "../indexeddb-file-store";
import { createIndexedDBLocalStore } from "../indexeddb-local-store";
import { WEB_VAULT_PATH } from "../indexeddb";
import type { Platform } from "./types";

/**
 * The web build is always a Satellite (ADR 0002): there is no Vault folder and
 * no filesystem watcher. Notes live in IndexedDB as `path` + `content`
 * records, resolved against a virtual Vault root so the core's Promote and
 * Sync flows work unchanged.
 */
export const platform: Platform = {
  target: "web",
  canChooseVault: false,

  async createLocalStore(): Promise<LocalStore> {
    return createIndexedDBLocalStore({ vaultPath: WEB_VAULT_PATH });
  },

  createFileStore() {
    return createIndexedDBFileStore();
  },

  async watchVault() {
    // A Satellite has no Vault to watch.
    return () => {};
  },

  async defaultVaultPath() {
    return WEB_VAULT_PATH;
  },

  async ensureVaultFolder() {
    // Notes are IndexedDB records; there is no folder to create.
  },

  async chooseVaultFolder() {
    // The web build never chooses a Vault.
    return null;
  },

  async provisionIOSVault(_localStore: LocalStore): Promise<void> {
    // No iOS sandbox Vault on the web build.
  },
};
