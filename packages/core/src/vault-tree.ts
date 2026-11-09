import { parseNote, resolvePath } from "./note";
import type {
  FileStore,
  NoteSyncState,
  VaultNote,
  VaultTree,
  VaultTreeEntry,
  VaultTreeFolder,
  VaultTreeNote,
} from "./types";

const MARKDOWN_EXT = /\.md$/i;
const CONFLICT_SUFFIX = /\(conflito\)$/i;
const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

function displayName(path: string): string {
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? path;
  return name.replace(MARKDOWN_EXT, "");
}

/**
 * The path relative to the Vault root, or null when `absPath` is outside the
 * Vault. Used to compare a listed file with the Notes the app knows about.
 */
export function vaultRelativePath(
  vaultPath: string,
  absPath: string,
): string | null {
  const root = vaultPath.replace(/\/+$/, "");
  if (absPath === root) {
    return "";
  }
  if (absPath.startsWith(`${root}/`)) {
    return absPath.slice(root.length + 1);
  }
  return null;
}

/** A Note's stored path resolved against this device's Vault folder. */
export function absoluteNotePath(vaultPath: string, path: string): string {
  return path.startsWith("/") ? path : resolvePath(vaultPath, path);
}

interface FolderDraft {
  name: string;
  path: string;
  folders: Map<string, FolderDraft>;
  files: VaultTreeNote[];
}

function toEntries(folder: FolderDraft): VaultTreeEntry[] {
  const folders: VaultTreeFolder[] = [...folder.folders.values()]
    .sort((left, right) => collator.compare(left.name, right.name))
    .map((child) => ({
      kind: "folder",
      name: child.name,
      path: child.path,
      children: toEntries(child),
    }));
  const files = [...folder.files].sort((left, right) =>
    collator.compare(left.name, right.name),
  );
  return [...folders, ...files];
}

/**
 * Groups absolute `.md` paths into the Vault's folder tree. Pure: it never
 * touches the filesystem. `managedPaths` holds the absolute paths of the Notes
 * the app knows about (those with an `id` in the frontmatter); everything else
 * is shown dimmed and is never read.
 */
export function buildVaultTree(
  vaultPath: string,
  filePaths: readonly string[],
  managedPaths: ReadonlySet<string>,
): VaultTree {
  const root = vaultPath.replace(/\/+$/, "");
  const draft: FolderDraft = {
    name: "",
    path: root,
    folders: new Map(),
    files: [],
  };

  for (const path of filePaths) {
    if (!MARKDOWN_EXT.test(path)) {
      continue;
    }
    const relative = vaultRelativePath(root, path);
    if (relative === null || relative === "") {
      continue;
    }

    const segments = relative.split("/").filter((segment) => segment !== "");
    const fileName = segments[segments.length - 1];
    if (fileName === undefined) {
      continue;
    }

    let folder = draft;
    for (const segment of segments.slice(0, -1)) {
      let child = folder.folders.get(segment);
      if (child === undefined) {
        child = {
          name: segment,
          path: `${folder.path}/${segment}`,
          folders: new Map(),
          files: [],
        };
        folder.folders.set(segment, child);
      }
      folder = child;
    }

    const name = displayName(fileName);
    folder.files.push({
      kind: "note",
      name,
      path,
      managed: managedPaths.has(path),
      conflict: CONFLICT_SUFFIX.test(name),
    });
  }

  return { path: root, entries: toEntries(draft) };
}

/** Absolute paths of the Notes the app manages, from the local Note sync state. */
export function managedNotePaths(
  vaultPath: string,
  notes: readonly NoteSyncState[],
): Set<string> {
  const paths = new Set<string>();
  for (const note of notes) {
    if (!note.deleted) {
      paths.add(absoluteNotePath(vaultPath, note.path));
    }
  }
  return paths;
}

/**
 * Reads a managed Note for the read-only view. Unmanaged files (no `id`, so no
 * local Note) are never read: the call resolves to null without touching them.
 */
export async function readManagedNote(
  vaultPath: string,
  notes: readonly NoteSyncState[],
  fileStore: FileStore,
  path: string,
): Promise<VaultNote | null> {
  if (!managedNotePaths(vaultPath, notes).has(path)) {
    return null;
  }
  const content = await fileStore.read(path);
  if (content === null) {
    return null;
  }
  const note = parseNote(content);
  if (note === null) {
    return null;
  }
  return {
    path,
    title: displayName(path),
    body: note.body,
    done: note.done,
    due: note.due,
  };
}
