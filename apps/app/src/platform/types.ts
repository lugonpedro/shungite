import type { FileStore, LocalStore } from "@taskmanager/core";

/** Platform capabilities the app uses; implemented per target (Tauri/web). */
export interface Platform {
  /**
   * Whether the target has a real Vault folder the user chooses (Tauri). The
   * web build has none, so it is always a Satellite and never the Home.
   */
  canChooseVault: boolean;
  createLocalStore(): Promise<LocalStore>;
  createFileStore(): FileStore;
  watchVault(path: string, onChange: () => void): Promise<() => void>;
  defaultVaultPath(): Promise<string>;
  ensureVaultFolder(path: string): Promise<void>;
  chooseVaultFolder(): Promise<string | null>;
  /** Provisions the iOS sandbox Vault on first launch; no-op on desktop/web. */
  provisionIOSVault(localStore: LocalStore): Promise<void>;
}
