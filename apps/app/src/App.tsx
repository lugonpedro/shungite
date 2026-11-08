import { initialTab } from "@taskmanager/core";
import { AuthPanel } from "./auth/AuthPanel";

export function App() {
  const tab = initialTab();
  return (
    <main>
      <nav>
        <button aria-current={tab === "todo"}>To-Do</button>
      </nav>
      <AuthPanel />
      <section aria-label="To-Do">
        <p>Nenhuma tarefa ainda.</p>
      </section>
    </main>
  );
}
