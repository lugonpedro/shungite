import {
  VaultRequiredError,
  createTaskManager,
  type Task,
  type TaskManager,
  type UpdateTaskInput,
} from "@taskmanager/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { supabase } from "./auth/supabaseClient";
import { useSession } from "./auth/useSession";
import { loadDeviceIdentity, setDeviceHome } from "./device";
import { createFileStore } from "./file-store";
import { Settings } from "./settings/Settings";
import { createSupabaseRemoteStore } from "./supabase-remote-store";
import { createTauriLocalStore } from "./tauri-local-store";
import { syncLabel, useSync, type SyncState } from "./use-sync";
import { useVaultWatch } from "./use-vault-watch";
import { NoteView } from "./vault/NoteView";
import { VaultExplorer } from "./vault/VaultExplorer";
import {
  chooseVaultFolder,
  defaultVaultPath,
  ensureVaultFolder,
} from "./vault-path";

type Screen = "todo" | "note" | "settings";

const PROMOTE_NEEDS_VAULT_NOTICE = "Escolha o Vault para promover";

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

function isVaultRequired(error: unknown): boolean {
  return (
    error instanceof VaultRequiredError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "vault-required")
  );
}

interface LayoutProps {
  screen: Screen;
  syncState: SyncState;
  onNavigate: (screen: Screen) => void;
  /** The Vault tree, shown under the To-Do item. */
  vaultExplorer?: ReactNode;
  children: ReactNode;
}

/**
 * The app's two areas: a narrow sidebar with the To-Do item, the Vault tree
 * and the Sync indicator at the bottom, and the main area with the current
 * screen. The sidebar footer shows the real Sync state and opens Configurações.
 */
function Layout({
  screen,
  syncState,
  onNavigate,
  vaultExplorer,
  children,
}: LayoutProps) {
  const syncModifier =
    syncState === "on"
      ? " sync-status--on"
      : syncState === "error"
        ? " sync-status--error"
        : syncState === "syncing"
          ? " sync-status--syncing"
          : "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <nav aria-label="Navegação" className="sidebar__nav">
          <button
            aria-current={screen === "todo" ? "page" : undefined}
            className={
              screen === "todo"
                ? "sidebar__item sidebar__item--active"
                : "sidebar__item"
            }
            onClick={() => onNavigate("todo")}
            type="button"
          >
            To-Do
          </button>
        </nav>
        {vaultExplorer}
        <button
          aria-current={screen === "settings" ? "page" : undefined}
          className={
            screen === "settings"
              ? "sidebar__footer sidebar__footer--active"
              : "sidebar__footer"
          }
          onClick={() => onNavigate("settings")}
          type="button"
        >
          <span className={`sync-status${syncModifier}`}>
            <span aria-hidden="true" className="sync-status__dot" />
            {syncLabel(syncState)}
          </span>
          <span className="sidebar__settings">
            <span aria-hidden="true" className="sidebar__settings-icon">
              ⚙
            </span>
            Configurações
          </span>
        </button>
      </aside>
      <main className="app">{children}</main>
    </div>
  );
}

export function App() {
  const [core, setCore] = useState<TaskManager | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [suggestedVaultPath, setSuggestedVaultPath] = useState<string | null>(
    null,
  );
  const [screen, setScreen] = useState<Screen>("todo");
  const [notePath, setNotePath] = useState<string | null>(null);
  const [vaultRevision, setVaultRevision] = useState(0);
  const [pendingPromoteId, setPendingPromoteId] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [todoNotice, setTodoNotice] = useState<string | null>(null);
  const { session } = useSession();

  useEffect(() => {
    let active = true;

    createTauriLocalStore()
      .then(async (localStore) => {
        if (!active) {
          return;
        }

        // The device where a Vault was chosen is the Home; it stays Home.
        const device = loadDeviceIdentity();
        const storedVaultPath = await localStore.getVaultPath();
        if (storedVaultPath !== null) {
          setDeviceHome();
          device.kind = "home";
        }
        if (!active) {
          return;
        }
        setVaultPath(storedVaultPath);

        const client = supabase;
        if (client !== null && session !== null) {
          setCore(
            createTaskManager({
              localStore,
              fileStore: createFileStore(),
              remoteStore: createSupabaseRemoteStore(client),
              device,
            }),
          );
        } else {
          setCore(
            createTaskManager({
              localStore,
              fileStore: createFileStore(),
            }),
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStartupError(errorMessage(error));
        }
      });

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    let active = true;
    defaultVaultPath()
      .then((path) => {
        if (active) {
          setSuggestedVaultPath(path);
        }
      })
      .catch(() => {
        // Without the path API (e.g. plain web dev) the suggestion is disabled.
      });
    return () => {
      active = false;
    };
  }, []);

  const signedIn = supabase !== null && session !== null;
  const syncState = useSync(core, signedIn);

  // The success notice is a short confirmation, not a permanent status.
  useEffect(() => {
    if (todoNotice === null) {
      return;
    }
    const timeout = setTimeout(() => setTodoNotice(null), 6_000);
    return () => clearTimeout(timeout);
  }, [todoNotice]);

  const navigate = useCallback((next: Screen) => {
    setScreen(next);
    if (next !== "note") {
      setNotePath(null);
    }
    if (next === "todo") {
      setPendingPromoteId(null);
      setSettingsNotice(null);
    }
  }, []);

  /** Opens a managed Note in the read-only view. */
  const openNote = useCallback((path: string) => {
    setNotePath(path);
    setScreen("note");
  }, []);

  /** Asks the Vault tree to reload after the app itself changed the Vault. */
  const bumpVault = useCallback(() => {
    setVaultRevision((current) => current + 1);
  }, []);

  const requestVaultForPromote = useCallback((taskId: string) => {
    setPendingPromoteId(taskId);
    setSettingsNotice(PROMOTE_NEEDS_VAULT_NOTICE);
    setTodoNotice(null);
    setScreen("settings");
  }, []);

  /** Remembers a Vault and, when a Promote is pending, runs it right away. */
  const applyVault = useCallback(
    async (path: string): Promise<void> => {
      if (core === null) {
        throw new Error("O app ainda está carregando.");
      }
      await core.setVaultPath(path);
      setDeviceHome();
      setVaultPath(path);
      setSettingsNotice(null);
      bumpVault();

      const pending = pendingPromoteId;
      setPendingPromoteId(null);
      if (pending !== null) {
        await core.promoteTask(pending);
        await core.sync().catch(() => {});
        setTodoNotice("Task promovida para o Vault.");
        setScreen("todo");
        bumpVault();
      }
    },
    [bumpVault, core, pendingPromoteId],
  );

  const useDefaultVault = useCallback(async (): Promise<void> => {
    if (suggestedVaultPath === null) {
      throw new Error("Não foi possível descobrir a pasta padrão.");
    }
    await ensureVaultFolder(suggestedVaultPath);
    await applyVault(suggestedVaultPath);
  }, [applyVault, suggestedVaultPath]);

  const chooseVault = useCallback(async (): Promise<void> => {
    const chosen = await chooseVaultFolder();
    if (chosen === null) {
      return;
    }
    await applyVault(chosen);
  }, [applyVault]);

  const vaultExplorer =
    core === null ? undefined : (
      <VaultExplorer
        core={core}
        onOpenNote={openNote}
        onOpenSettings={() => navigate("settings")}
        revision={vaultRevision}
        selectedPath={notePath}
        vaultPath={vaultPath}
      />
    );

  if (startupError !== null) {
    return (
      <Layout
        onNavigate={navigate}
        screen={screen}
        syncState={syncState}
        vaultExplorer={vaultExplorer}
      >
        <p className="error" role="alert">
          Não foi possível abrir o banco local: {startupError}
        </p>
      </Layout>
    );
  }

  if (core === null) {
    return (
      <Layout onNavigate={navigate} screen={screen} syncState={syncState}>
        <p className="muted">Carregando…</p>
      </Layout>
    );
  }

  return (
    <Layout
      onNavigate={navigate}
      screen={screen}
      syncState={syncState}
      vaultExplorer={vaultExplorer}
    >
      {screen === "settings" ? (
        <Settings
          notice={settingsNotice}
          onChooseVault={chooseVault}
          onUseDefaultVault={useDefaultVault}
          suggestedPath={suggestedVaultPath}
          syncState={syncState}
          vaultPath={vaultPath}
        />
      ) : screen === "note" && notePath !== null ? (
        <NoteView core={core} path={notePath} revision={vaultRevision} />
      ) : (
        <Todo
          core={core}
          notice={todoNotice}
          onVaultChanged={bumpVault}
          onVaultRequired={requestVaultForPromote}
        />
      )}
    </Layout>
  );
}

interface TodoProps {
  core: TaskManager;
  notice: string | null;
  onVaultRequired: (taskId: string) => void;
  /** Called after a Promote or a Note rewrite, so the Vault tree refreshes. */
  onVaultChanged: () => void;
}

function Todo({ core, notice, onVaultRequired, onVaultChanged }: TodoProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "n"
      ) {
        event.preventDefault();
        addInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const refresh = useCallback(async () => {
    setTasks(await core.listTasks());
  }, [core]);

  useVaultWatch(core, refresh);

  useEffect(() => {
    let active = true;

    core
      .listTasks()
      .then((loaded) => {
        if (active) {
          setTasks(loaded);
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
  }, [core]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        await refresh();
        // Push the change to Sync right away (a no-op when signed out).
        await core.sync().catch(() => {});
        onVaultChanged();
        setError(null);
        return true;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      }
    },
    [core, onVaultChanged, refresh],
  );

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === "") {
      return;
    }
    try {
      await core.createTask({
        text: trimmed,
        due: due === "" ? null : due,
      });
      setText("");
      setDue("");
      await refresh();
      await core.sync().catch(() => {});
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const toggleTask = (id: string, done: boolean) =>
    run(() => core.setTaskDone(id, done));

  const updateTask = (id: string, changes: UpdateTaskInput) =>
    run(() => core.updateTask(id, changes));

  const deleteTask = (id: string) => run(() => core.deleteTask(id));

  /** Promote through the core; a missing Vault sends the user to Configurações. */
  async function promoteTask(id: string): Promise<void> {
    try {
      await core.promoteTask(id);
      await refresh();
      await core.sync().catch(() => {});
      onVaultChanged();
      setError(null);
    } catch (cause) {
      if (isVaultRequired(cause)) {
        onVaultRequired(id);
        return;
      }
      setError(errorMessage(cause));
    }
  }

  const open = tasks.filter((task) => !task.done).length;
  const done = tasks.length - open;

  return (
    <>
      <header className="app__header">
        <h1>To-Do</h1>
        {tasks.length > 0 && (
          <p className="app__count">
            {open} em aberto · {done} {done === 1 ? "feita" : "feitas"}
          </p>
        )}
      </header>

      {notice !== null && (
        <p className="notice notice--success" role="status">
          {notice}
        </p>
      )}

      <form className="add-form" onSubmit={addTask}>
        <input
          aria-label="Nova tarefa"
          autoFocus
          className="add-form__text"
          onChange={(event) => setText(event.target.value)}
          placeholder="O que precisa ser feito?"
          ref={addInputRef}
          value={text}
        />
        <input
          aria-label="Data de vencimento (opcional)"
          className="add-form__due"
          onChange={(event) => setDue(event.target.value)}
          type="date"
          value={due}
        />
        <button disabled={text.trim() === ""} type="submit">
          Adicionar
        </button>
      </form>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : tasks.length === 0 ? (
        <p className="empty">Nenhuma tarefa ainda.</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              onDelete={deleteTask}
              onPromote={promoteTask}
              onToggle={toggleTask}
              onUpdate={updateTask}
              task={task}
            />
          ))}
        </ul>
      )}
    </>
  );
}

interface TaskItemProps {
  task: Task;
  onToggle: (id: string, done: boolean) => Promise<boolean>;
  onUpdate: (id: string, changes: UpdateTaskInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onPromote: (id: string) => Promise<void>;
}

function TaskItem({
  task,
  onToggle,
  onUpdate,
  onDelete,
  onPromote,
}: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(task.text);
  const [draftDue, setDraftDue] = useState(task.due ?? "");
  const conflict = /\(conflito\)$/i.test(task.text.trim());

  function startEditing() {
    setDraftText(task.text);
    setDraftDue(task.due ?? "");
    setEditing(true);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draftText.trim();
    if (trimmed === "") {
      return;
    }
    const saved = await onUpdate(task.id, {
      text: trimmed,
      due: draftDue === "" ? null : draftDue,
    });
    if (saved) {
      setEditing(false);
    }
  }

  function cancelOnEscape(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <li className="task task--editing">
        <form
          className="task__edit-form"
          onKeyDown={cancelOnEscape}
          onSubmit={saveEdit}
        >
          <input
            aria-label="Editar texto"
            autoFocus
            className="task__edit-text"
            onChange={(event) => setDraftText(event.target.value)}
            value={draftText}
          />
          <input
            aria-label="Editar data de vencimento"
            className="task__edit-due"
            onChange={(event) => setDraftDue(event.target.value)}
            type="date"
            value={draftDue}
          />
          <button disabled={draftText.trim() === ""} type="submit">
            Salvar
          </button>
          <button
            className="button--ghost"
            onClick={() => setEditing(false)}
            type="button"
          >
            Cancelar
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className={task.done ? "task task--done" : "task"}>
      <input
        aria-label={task.done ? `Reabrir ${task.text}` : `Concluir ${task.text}`}
        checked={task.done}
        className="task__check"
        onChange={(event) => void onToggle(task.id, event.target.checked)}
        type="checkbox"
      />
      <span className="task__text">{task.text}</span>
      {conflict && (
        <span
          className="task__badge"
          title="Versão em conflito: revisar e apagar quando quiser"
        >
          conflito
        </span>
      )}
      {task.notePath !== null && (
        <span
          aria-label="Já promovida para o Vault"
          className="task__note-icon"
          role="img"
          title={task.notePath}
        >
          <FileIcon />
        </span>
      )}
      {task.due !== null && (
        <time className="task__due" dateTime={task.due}>
          {formatDue(task.due)}
        </time>
      )}
      <TaskMenu
        onDelete={() => void onDelete(task.id)}
        onEdit={startEditing}
        onPromote={() => void onPromote(task.id)}
        promoted={task.notePath !== null}
        taskText={task.text}
      />
    </li>
  );
}

interface TaskMenuProps {
  taskText: string;
  promoted: boolean;
  onEdit: () => void;
  onPromote: () => void;
  onDelete: () => void;
}

/**
 * The "⋯" menu, visible on hover, that holds Editar, Promote and Apagar. A
 * Task that already has a Note does not offer Promote again.
 */
function TaskMenu({
  taskText,
  promoted,
  onEdit,
  onPromote,
  onDelete,
}: TaskMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (
        rootRef.current !== null &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="task__menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Ações de ${taskText}`}
        className="task__menu-button"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        ⋯
      </button>
      {open && (
        <div className="task__menu-list" role="menu">
          <button
            className="task__menu-item"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            role="menuitem"
            type="button"
          >
            Editar
          </button>
          {!promoted && (
            <button
              className="task__menu-item"
              onClick={() => {
                setOpen(false);
                onPromote();
              }}
              role="menuitem"
              type="button"
            >
              Promote
            </button>
          )}
          <button
            className="task__menu-item task__menu-item--danger"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            role="menuitem"
            type="button"
          >
            Apagar
          </button>
        </div>
      )}
    </div>
  );
}

function FileIcon() {
  return (
    <svg
      aria-hidden="true"
      className="task__note-icon-svg"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
