import { parseNote } from "./note";
import type { FileStore, LocalStore, ReconcileResult, Task } from "./types";

/** The Task title derived from a Note path: the file name without the `.md`. */
export function noteTitle(path: string): string {
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? path;
  return name.replace(/\.md$/i, "");
}

interface NoteOnDisk {
  path: string;
  title: string;
  done: boolean;
  due: string | null;
}

export interface ReconcileDeps {
  localStore: LocalStore;
  fileStore: FileStore;
  now: () => Date;
}

function touch(task: Task, now: () => Date): Task {
  return {
    ...task,
    version: task.version + 1,
    updatedAt: now().toISOString(),
  };
}

/**
 * Reconciles external edits to the Vault into Tasks.
 *
 * Reads every `.md` under the Vault and links each one to its Task by the `id`
 * in the frontmatter. Notes without an `id` are ignored. A Task whose Note file
 * disappeared goes back to having no file (the Promote is undone, the Task is
 * kept). Subfolders are covered because `FileStore.list` scans recursively.
 */
export async function reconcileVault(deps: ReconcileDeps): Promise<ReconcileResult> {
  const { localStore, fileStore, now } = deps;

  const vaultPath = await localStore.getVaultPath();
  if (vaultPath === null) {
    return { changed: [], scanned: 0, ignored: 0, demoted: 0 };
  }

  const notes = new Map<string, NoteOnDisk>();
  let ignored = 0;
  for (const path of await fileStore.list(vaultPath)) {
    const content = await fileStore.read(path);
    if (content === null) {
      continue;
    }
    const note = parseNote(content);
    if (note === null) {
      ignored += 1;
      continue;
    }
    notes.set(note.id, {
      path,
      title: noteTitle(path),
      done: note.done,
      due: note.due,
    });
  }

  const changed: Task[] = [];
  let demoted = 0;

  for (const task of await localStore.getTasks()) {
    if (task.deleted || task.notePath === null) {
      continue;
    }
    const note = notes.get(task.id);
    if (note === undefined) {
      // The Note is gone: the Task returns to the To-Do without a file.
      const updated = touch({ ...task, notePath: null }, now);
      await localStore.saveTask(updated);
      changed.push(updated);
      demoted += 1;
      continue;
    }
    if (
      task.text !== note.title ||
      task.done !== note.done ||
      task.due !== note.due ||
      task.notePath !== note.path
    ) {
      const updated = touch(
        {
          ...task,
          text: note.title,
          done: note.done,
          due: note.due,
          notePath: note.path,
        },
        now,
      );
      await localStore.saveTask(updated);
      changed.push(updated);
    }
  }

  return { changed, scanned: notes.size, ignored, demoted };
}
