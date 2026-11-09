import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import type { LocalStore } from "@taskmanager/core";
import { createFileStore, watchVault } from "../file-store";
import { createTauriLocalStore } from "../tauri-local-store";
import {
  chooseVaultFolder,
  defaultVaultPath,
  ensureVaultFolder,
} from "../vault-path";
import { isIOS } from "./detect";
import type { Platform } from "./types";

/** Folder inside the app sandbox that holds this Satellite's copy of the Vault. */
const VAULT_FOLDER = "vault";

/** Tauri (desktop/mobile) platform: wraps the existing Tauri-backed implementations. */
export const platform: Platform = {
  target: "tauri",
  canChooseVault: true,
  createLocalStore: createTauriLocalStore,
  createFileStore,
  watchVault,
  defaultVaultPath,
  ensureVaultFolder,
  chooseVaultFolder,
  async provisionIOSVault(localStore: LocalStore): Promise<void> {
    if (!isIOS()) {
      return;
    }

    const path = await join(await appDataDir(), VAULT_FOLDER);
    if (!(await exists(path))) {
      await mkdir(path, { recursive: true });
    }

    const current = await localStore.getVaultPath();
    if (current !== path) {
      await localStore.saveVaultPath(path);
    }
  },
};
