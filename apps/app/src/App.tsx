import {
  createTaskManager,
  type Task,
  type TaskManager,
  type UpdateTaskInput,
} from "@taskmanager/core";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { AuthPanel } from "./auth/AuthPanel";
import { createFileStore } from "./file-store";
import { createTauriLocalStore } from "./tauri-local-store";
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

export function App() {
  const [core, setCore] = useState<TaskManager | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    createTauriLocalStore()
      .then((localStore) => {
        if (active) {
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
  }, []);

  if (startupError !== null) {
    return (
      <main className="app">
        <p className="error" role="alert">
          Não foi possível abrir o banco local: {startupError}
        </p>
      </main>
    );
  }

  if (core === null) {
    return (
      <main className="app">
        <p className="muted">Carregando…</p>
      </main>
    );
  }

  return <Todo core={core} />;
}

function Todo({ core }: { core: TaskManager }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");

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
        setError(null);
        return true;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      }
    },
    [refresh],
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

  const open = tasks.filter((task) => !task.done).length;
  const done = tasks.length - open;

  return (
    <main className="app">
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
              onToggle={toggleTask}
              onUpdate={updateTask}
              task={task}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

interface TaskItemProps {
  task: Task;
  onToggle: (id: string, done: boolean) => Promise<boolean>;
  onUpdate: (id: string, changes: UpdateTaskInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

function TaskItem({ task, onToggle, onUpdate, onDelete }: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(task.text);
  const [draftDue, setDraftDue] = useState(task.due ?? "");

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

  if (editing) {
    return (
      <li className="task task--editing">
        <form className="task__edit-form" onSubmit={saveEdit}>
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
      {task.due !== null && (
        <time className="task__due" dateTime={task.due}>
          {formatDue(task.due)}
        </time>
      )}
      <button
        aria-label={`Editar ${task.text}`}
        className="button--ghost"
        onClick={startEditing}
        type="button"
      >
        Editar
      </button>
      <button
        aria-label={`Apagar ${task.text}`}
        className="button--danger"
        onClick={() => void onDelete(task.id)}
        type="button"
      >
        Apagar
      </button>
    </li>
  );
}
