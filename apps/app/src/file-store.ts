import type { FileStore } from "@taskmanager/core";

/**
 * Vault file access arrives with the Promote UI (issue #3). Until then a Task
 * created in the To-Do never has a Note, so this flow never touches files.
 */
export function createFileStore(): FileStore {
  async function unavailable(): Promise<never> {
    throw new Error("Vault file access is not available yet.");
  }

  return {
    async read() {
      return null;
    },
    async write() {
      return unavailable();
    },
    async remove() {
      return unavailable();
    },
    async exists() {
      return false;
    },
  };
}
