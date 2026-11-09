import type { FileStore, LocalStore } from "@taskmanager/core";

/** Platform capabilities the app uses; implemented per target (Tauri/web). */
export interface Platform {
  createLocalStore(): Promise<LocalStore>;
  createFileStore(): FileStore;
  watchVault(path: string, onChange: () => void): Promise<() => void>;
  defaultVaultPath(): Promise<string>;
  ensureVaultFolder(path: string): Promise<void>;
  chooseVaultFolder(): Promise<string | null>;
}
