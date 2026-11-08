import type { LocalStore, NoteSyncState } from "./types";

export interface NoteChange {
  /** The Note id, equal to the Task id it was promoted from. */
  id: string;
  /** Vault-relative path, e.g. `Note.md` or `Sub/Note.md`. */
  path: string;
  /** Full `.md` content (frontmatter + body); ignored when `deleted`. */
  content: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Records a local change to a Note, bumping its `version` only when something
 * actually changed (path, content or the deleted flag). `baseVersion` is left
 * untouched: the Sync engine alone advances it to the `version` it has
 * mirrored to the remote, so a change made here stays detectable by Sync.
 */
export async function recordNoteChange(
  localStore: LocalStore,
  change: NoteChange,
): Promise<NoteSyncState> {
  const existing = await localStore.getNote(change.id);
  const content = change.deleted ? "" : change.content;
  const unchanged =
    existing !== null &&
    existing.path === change.path &&
    existing.content === content &&
    existing.deleted === change.deleted;
  if (unchanged) {
    return existing;
  }

  const next: NoteSyncState = {
    id: change.id,
    path: change.path,
    content,
    version: (existing?.version ?? 0) + 1,
    baseVersion: existing?.baseVersion ?? 0,
    deleted: change.deleted,
    createdAt: existing?.createdAt ?? change.createdAt,
    updatedAt: change.updatedAt,
  };
  await localStore.saveNote(next);
  return next;
}
