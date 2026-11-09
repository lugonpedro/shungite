import {
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
import { AuthPanel } from "./auth/AuthPanel";
import { supabase } from "./auth/supabaseClient";
import { useSession } from "./auth/useSession";
import { loadDeviceIdentity, setDeviceHome } from "./device";
import { createFileStore } from "./file-store";
import { ensureIOSVault } from "./ios-vault";
import { isIOS } from "./platform";
import { createSupabaseRemoteStore } from "./supabase-remote-store";
import { createTauriLocalStore } from "./tauri-local-store";
import { useSync } from "./use-sync";
import { useVaultWatch } from "./use-vault-watch";

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

interface LayoutProps {
  syncOn: boolean;
  children: ReactNode;
}

/**
 * The app's two areas: a narrow sidebar with the To-Do item and the Sync
 * indicator at the bottom, and the main area with the current screen.
 */
function Layout({ syncOn, children }: LayoutProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <nav aria-label="Navegação" className="sidebar__nav">
          <span aria-current="page" className="sidebar__item sidebar__item--active">
            To-Do
          </span>
        </nav>
        <footer className="sidebar__footer">
          <span
            className={syncOn ? "sync-status sync-status--on" : "sync-status"}
          >
            <span aria-hidden="true" className="sync-status__dot" />
            {syncOn ? "sincronizado" : "Sync desligado"}
          </span>
        </footer>
      </aside>
      <main className="app">{children}</main>
    </div>
  );
}

export function App() {
  const [core, setCore] = useState<TaskManager | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const { session } = useSession();

  useEffect(() => {
    let active = true;

    createTauriLocalStore()
      .then(async (localStore) => {
        if (!active) {
          return;
        }

        // The iOS Vault lives in the app sandbox and is fed only by Sync.
        await ensureIOSVault(localStore);

        // The device where a Vault was chosen is the Home; it stays Home.
        // iOS is always a Satellite, even though its sandbox Vault exists.
        const device = loadDeviceIdentity();
        if (!isIOS() && (await localStore.getVaultPath()) !== null) {
          setDeviceHome();
          device.kind = "home";
        }

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

  const signedIn = supabase !== null && session !== null;
  useSync(core, signedIn);

  if (startupError !== null) {
    return (
      <Layout syncOn={signedIn}>
        <p className="error" role="alert">
          Não foi possível abrir o banco local: {startupError}
        </p>
      </Layout>
    );
  }

  if (core === null) {
    return (
      <Layout syncOn={signedIn}>
        <p className="muted">Carregando…</p>
      </Layout>
    );
  }

  return (
    <Layout syncOn={signedIn}>
      <Todo core={core} />
    </Layout>
  );
}

function Todo({ core }: { core: TaskManager }) {
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
        setError(null);
        return true;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      }
    },
    [core, refresh],
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

  const promoteTask = (id: string) => run(() => core.promoteTask(id));

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

      <AuthPanel />

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
  onPromote: (id: string) => Promise<boolean>;
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
      {task.due !== null && (
        <time className="task__due" dateTime={task.due}>
          {formatDue(task.due)}
        </time>
      )}
      {task.notePath === null ? (
        <button
          aria-label={`Promover ${task.text} para Note`}
          className="button--ghost task__action"
          onClick={() => void onPromote(task.id)}
          type="button"
        >
          Promover
        </button>
      ) : (
        <span className="task__note" title="Já promovida: Note no Vault">
          .md
        </span>
      )}
      <button
        aria-label={`Editar ${task.text}`}
        className="button--ghost task__action"
        onClick={startEditing}
        type="button"
      >
        Editar
      </button>
      <button
        aria-label={`Apagar ${task.text}`}
        className="button--danger task__action"
        onClick={() => void onDelete(task.id)}
        type="button"
      >
        Apagar
      </button>
    </li>
  );
}
