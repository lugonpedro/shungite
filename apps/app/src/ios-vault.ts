import type { LocalStore } from "@shungite/core";
import { platform } from "./platform";

/**
 * On iOS the Vault lives in the app sandbox and is fed only by Sync: there is
 * no folder picker, so the app provisions the folder itself on first launch.
 * Desktop builds keep choosing the Vault manually, so this is a no-op there.
 */
export async function ensureIOSVault(localStore: LocalStore): Promise<void> {
  await platform.provisionIOSVault(localStore);
}
