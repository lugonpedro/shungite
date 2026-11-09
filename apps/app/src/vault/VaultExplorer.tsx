import type { TaskManager, VaultTree, VaultTreeEntry } from "@taskmanager/core";
import { useCallback, useEffect, useState } from "react";
import { watchVault } from "../file-store";
import "./vault.css";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface VaultExplorerProps {
  core: TaskManager;
  vaultPath: string | null;
  /** Bumped after the app itself changes the Vault (e.g. a Promote). */
  revision: number;
  selectedPath: string | null;
  onOpenNote: (path: string) => void;
  onOpenSettings: () => void;
}

/**
 * The read-only Vault explorer in the sidebar: a tree of the Vault's folders
 * and `.md` files below the To-Do item. Folders expand and collapse; managed
 * Notes open in the main area, unmanaged `.md` files are dimmed and inert.
 * The tree reloads whenever the Vault changes on disk.
 */
export function VaultExplorer({
  core,
  vaultPath,
  revision,
  selectedPath,
  onOpenNote,
  onOpenSettings,
}: VaultExplorerProps) {
  const [tree, setTree] = useState<VaultTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const load = useCallback(async () => {
    try {
      const loaded = await core.listVaultTree();
      setTree(loaded);
      setError(null);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [core]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, vaultPath, revision]);

  // Live refresh: the same watcher behavior the To-Do uses, so a `.md`
  // created, renamed or deleted outside the app shows up here too.
  useEffect(() => {
    if (vaultPath === null) {
      return;
    }
    let active = true;
    let stop: (() => void) | null = null;

    watchVault(vaultPath, () => {
      void load();
    })
      .then((unwatch) => {
        if (active) {
          stop = unwatch;
        } else {
          unwatch();
        }
      })
      .catch(() => {
        // Watching is best-effort; the tree still reloads on other changes.
      });

    return () => {
      active = false;
      if (stop !== null) {
        stop();
      }
    };
  }, [vaultPath, load]);

  // Keep the folder path of the open Note expanded.
  useEffect(() => {
    if (selectedPath === null || tree === null) {
      return;
    }
    const prefix = `${tree.path}/`;
    if (!selectedPath.startsWith(prefix)) {
      return;
    }
    const segments = selectedPath.slice(prefix.length).split("/").slice(0, -1);
    setExpanded((current) => {
      const next = new Set(current);
      let path = tree.path;
      for (const segment of segments) {
        path = `${path}/${segment}`;
        next.add(path);
      }
      return next;
    });
  }, [selectedPath, tree]);

  const toggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  function renderEntries(entries: VaultTreeEntry[], depth: number) {
    return (
      <ul className="vault__list" role={depth === 0 ? "tree" : "group"}>
        {entries.map((entry) =>
          entry.kind === "folder" ? (
            <li
              aria-expanded={expanded.has(entry.path)}
              key={entry.path}
              role="treeitem"
            >
              <button
                className="vault__row vault__row--folder"
                onClick={() => toggle(entry.path)}
                style={{ paddingLeft: 8 + depth * 12 }}
                type="button"
              >
                <span aria-hidden="true" className="vault__chevron">
                  {expanded.has(entry.path) ? "▾" : "▸"}
                </span>
                <span className="vault__name">{entry.name}</span>
              </button>
              {expanded.has(entry.path) &&
                renderEntries(entry.children, depth + 1)}
            </li>
          ) : (
            <li key={entry.path} role="treeitem">
              <button
                aria-current={entry.path === selectedPath ? "page" : undefined}
                className={[
                  "vault__row",
                  "vault__row--note",
                  entry.managed ? "" : "vault__row--unmanaged",
                  entry.path === selectedPath ? "vault__row--active" : "",
                ]
                  .filter((part) => part !== "")
                  .join(" ")}
                disabled={!entry.managed}
                onClick={() => onOpenNote(entry.path)}
                style={{ paddingLeft: 8 + depth * 12 }}
                title={
                  entry.managed
                    ? entry.path
                    : "Arquivo sem id: o app não gerencia este .md"
                }
                type="button"
              >
                <FileIcon />
                <span className="vault__name">{entry.name}</span>
                {entry.conflict && (
                  <span className="vault__badge">conflito</span>
                )}
              </button>
            </li>
          ),
        )}
      </ul>
    );
  }

  return (
    <section aria-label="Arquivos do Vault" className="vault">
      <p className="vault__label">Vault</p>

      {vaultPath === null ? (
        <div className="vault__invite">
          <button onClick={onOpenSettings} type="button">
            Escolha o Vault
          </button>
          <p className="vault__hint">
            Os arquivos <code>.md</code> do seu Vault aparecem aqui.
          </p>
        </div>
      ) : loading && tree === null ? (
        <p className="vault__muted">Carregando…</p>
      ) : error !== null ? (
        <p className="vault__error" role="alert">
          {error}
        </p>
      ) : tree === null || tree.entries.length === 0 ? (
        <p className="vault__muted">Nenhum arquivo .md no Vault ainda.</p>
      ) : (
        renderEntries(tree.entries, 0)
      )}
    </section>
  );
}

function FileIcon() {
  return (
    <svg
      aria-hidden="true"
      className="vault__file-icon"
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width="12"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
