import type { FileStore } from "@taskmanager/core";
import {
  exists as fsExists,
  readDir,
  readTextFile,
  remove as fsRemove,
  watch,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

const MARKDOWN_EXT = /\.md$/i;

function joinPath(folder: string, name: string): string {
  return `${folder.replace(/\/+$/, "")}/${name}`;
}

/** Walks `dir` recursively and returns the absolute path of every `.md` file. */
async function listMarkdownFiles(dir: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(folder: string): Promise<void> {
    for (const entry of await readDir(folder)) {
      const path = joinPath(folder, entry.name);
      if (entry.isDirectory) {
        await walk(path);
      } else if (entry.isFile && MARKDOWN_EXT.test(entry.name)) {
        found.push(path);
      }
    }
  }

  await walk(dir);
  return found;
}

/**
 * A real `FileStore` over the Vault, backed by the Tauri fs plugin. It is the
 * adapter the app passes to `createTaskManager` so Notes read and write real
 * `.md` files.
 */
export function createFileStore(): FileStore {
  return {
    async read(path) {
      if (!(await fsExists(path))) {
        return null;
      }
      return readTextFile(path);
    },
    async write(path, content) {
      await writeTextFile(path, content);
    },
    async remove(path) {
      await fsRemove(path);
    },
    async exists(path) {
      return fsExists(path);
    },
    async list(dir) {
      return listMarkdownFiles(dir);
    },
  };
}

/**
 * Watches the Vault for changes made outside the app (e.g. in Obsidian) and
 * calls `onChange` for each batch of filesystem events. Returns a function that
 * stops watching.
 *
 * Requires the `watch` Cargo feature of `tauri-plugin-fs` to be enabled.
 */
export async function watchVault(
  path: string,
  onChange: () => void,
): Promise<() => void> {
  return watch(path, () => onChange(), { recursive: true, delayMs: 300 });
}
