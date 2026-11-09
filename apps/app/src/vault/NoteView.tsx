import type { TaskManager, VaultNote } from "@taskmanager/core";
import { useEffect, useState } from "react";
import { Markdown } from "./markdown";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDue(due: string): string {
  const [year, month, day] = due.split("-");
  if (year === undefined || month === undefined || day === undefined) {
    return due;
  }
  return `${day}/${month}/${year}`;
}

interface NoteViewProps {
  core: TaskManager;
  path: string;
  /** Bumped when the Vault changes on disk, so the Note is re-read. */
  revision: number;
}

/**
 * The read-only view of a managed Note: the title and its Markdown body. The
 * frontmatter is hidden; only a small line with `done`/`due` stays visible.
 */
export function NoteView({ core, path, revision }: NoteViewProps) {
  const [note, setNote] = useState<VaultNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    core
      .readNote(path)
      .then((loaded) => {
        if (active) {
          setNote(loaded);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [core, path, revision]);

  if (loading) {
    return <p className="muted">Carregando…</p>;
  }

  if (error !== null) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }

  if (note === null) {
    return <p className="empty">Esta Note não está mais no Vault.</p>;
  }

  return (
    <>
      <header className="app__header note__header">
        <div>
          <h1>{note.title}</h1>
          <p className="note__meta">
            <span className="note__readonly">somente leitura</span>
            {note.done && <span>· feita</span>}
            {note.due !== null && <span>· vence {formatDue(note.due)}</span>}
          </p>
        </div>
      </header>

      {note.body.trim() === "" ? (
        <p className="empty">Esta Note não tem texto além do frontmatter.</p>
      ) : (
        <article className="note">
          <Markdown text={note.body} />
        </article>
      )}
    </>
  );
}
