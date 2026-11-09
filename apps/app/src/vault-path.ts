import { homeDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { mkdir } from "@tauri-apps/plugin-fs";

/** The Vault the app suggests when the user has not chosen one yet. */
export async function defaultVaultPath(): Promise<string> {
  return join(await homeDir(), "Documents", "TaskManager");
}

/** Creates the Vault folder on disk if it does not exist yet. */
export async function ensureVaultFolder(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Opens the system folder picker and returns the chosen absolute path, or
 * `null` when the user cancels.
 */
export async function chooseVaultFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    recursive: true,
    title: "Escolher o Vault",
  });
  return typeof selected === "string" ? selected : null;
}
