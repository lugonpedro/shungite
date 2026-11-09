import type { LocalStore } from "@taskmanager/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { isIOS } from "./platform";

/** Folder inside the app sandbox that holds this Satellite's copy of the Vault. */
const VAULT_FOLDER = "vault";

/**
 * On iOS the Vault lives in the app sandbox and is fed only by Sync: there is
 * no folder picker, so the app provisions the folder itself on first launch
 * (inside the app's data directory, which is private to the app). Desktop
 * builds keep choosing the Vault manually, so this is a no-op there.
 */
export async function ensureIOSVault(localStore: LocalStore): Promise<void> {
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
}
