import { createFileStore, watchVault } from "../file-store";
import { createTauriLocalStore } from "../tauri-local-store";
import {
  chooseVaultFolder,
  defaultVaultPath,
  ensureVaultFolder,
} from "../vault-path";
import type { Platform } from "./types";

/** Tauri (desktop) platform: wraps the existing Tauri-backed implementations. */
export const platform: Platform = {
  createLocalStore: createTauriLocalStore,
  createFileStore,
  watchVault,
  defaultVaultPath,
  ensureVaultFolder,
  chooseVaultFolder,
};
