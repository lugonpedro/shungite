import { initialTab } from "@taskmanager/core";

export function App() {
  const tab = initialTab();
  return (
    <main>
      <nav>
        <button aria-current={tab === "todo"}>To-Do</button>
      </nav>
      <section aria-label="To-Do">
        <p>Nenhuma tarefa ainda.</p>
      </section>
    </main>
  );
}
