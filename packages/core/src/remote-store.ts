/** A Task's synced fields as kept on the remote (the Supabase `tasks` table). */
export interface RemoteTask {
  id: string;
  /** The remote column is `title`; locally this is the Task's `text`. */
  title: string;
  done: boolean;
  /** Due day in `YYYY-MM-DD`, or null when the Task has no due date. */
  due: string | null;
  version: number;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A Note's synced fields as kept on the remote (the Supabase `notes` table). */
export interface RemoteNote {
  id: string;
  path: string;
  content: string;
  version: number;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A device registered for Sync (the Supabase `devices` table). */
export interface RemoteDevice {
  /** Stable id (UUID) that never changes for this install. */
  id: string;
  /** Human-readable name, e.g. "Pedro's MacBook". */
  name: string;
  /** Home on the device where the Vault lives, Satellite everywhere else. */
  kind: "home" | "satellite";
  createdAt: string;
  updatedAt: string;
}

/**
 * The remote store a device syncs against. The app supplies a Supabase
 * adapter; the core tests supply an in-memory adapter.
 */
export interface RemoteStore {
  listTasks(): Promise<RemoteTask[]>;
  upsertTask(task: RemoteTask): Promise<void>;
  listNotes(): Promise<RemoteNote[]>;
  upsertNote(note: RemoteNote): Promise<void>;
  listDevices(): Promise<RemoteDevice[]>;
  registerDevice(device: RemoteDevice): Promise<void>;
}

/** This device's identity for Sync. */
export interface DeviceInfo {
  /** Stable id (UUID) that never changes for this install. */
  id: string;
  /** Human-readable name, e.g. "Pedro's MacBook". */
  name: string;
  /** Home on the device where the Vault lives, Satellite everywhere else. */
  kind: "home" | "satellite";
}
