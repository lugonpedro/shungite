import type { FileStore, LocalStore } from "@shungite/core";

/** Platform capabilities the app uses; implemented per target (Tauri/web). */
export interface Platform {
  /**
   * Build target. The web build is the PWA Satellite: it has no Vault folder
   * and signs in with a 6-digit code first (see ADR 0002).
   */
  readonly target: "tauri" | "web";
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
