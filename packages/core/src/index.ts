export type Tab = "todo";

/** The tab the app opens on. */
export function initialTab(): Tab {
  return "todo";
}

export * from "./types";
export { createTaskManager } from "./task-manager";
export { uuidv7 } from "./uuid";
