export type Tab = "todo";

/** The tab the app opens on. */
export function initialTab(): Tab {
  return "todo";
}

export * from "./types";
export * from "./remote-store";
export { createShungite } from "./shungite";
export { uuidv7 } from "./uuid";
