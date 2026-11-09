import type {
  RemoteDevice,
  RemoteNote,
  RemoteStore,
  RemoteTask,
} from "@shungite/core";
import type { SupabaseClient } from "@supabase/supabase-js";

interface TaskRow {
  id: string;
  title: string;
  done: boolean;
  due: string | null;
  version: number;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

interface NoteRow {
  id: string;
  path: string;
  content: string;
  version: number;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

interface DeviceRow {
  id: string;
  name: string;
  kind: "home" | "satellite";
  created_at: string;
  updated_at: string;
}

/**
 * The app's `RemoteStore` against the Supabase schema in
 * `supabase/migrations` (`tasks`, `notes` and `devices`, all with RLS by
 * `user_id`). The authenticated user is scoped automatically by RLS; writes
 * still set `user_id` explicitly so the insert policy passes.
 */
export function createSupabaseRemoteStore(
  client: SupabaseClient,
): RemoteStore {
  async function userId(): Promise<string> {
    const { data, error } = await client.auth.getUser();
    if (error || data.user === null) {
      throw new Error("Sign in before enabling Sync.");
    }
    return data.user.id;
  }

  return {
    async listTasks() {
      const { data, error } = await client.from("tasks").select("*");
      if (error) throw error;
      return ((data ?? []) as TaskRow[]).map(
        (row): RemoteTask => ({
          id: row.id,
          title: row.title,
          done: row.done,
          due: row.due,
          version: row.version,
          deleted: row.deleted,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }),
      );
    },

    async upsertTask(task) {
      const { error } = await client.from("tasks").upsert({
        id: task.id,
        user_id: await userId(),
        title: task.title,
        done: task.done,
        due: task.due,
        version: task.version,
        deleted: task.deleted,
        created_at: task.createdAt,
        updated_at: task.updatedAt,
      });
      if (error) throw error;
    },

    async listNotes() {
      const { data, error } = await client.from("notes").select("*");
      if (error) throw error;
      return ((data ?? []) as NoteRow[]).map(
        (row): RemoteNote => ({
          id: row.id,
          path: row.path,
          content: row.content,
          version: row.version,
          deleted: row.deleted,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }),
      );
    },

    async upsertNote(note) {
      const { error } = await client.from("notes").upsert({
        id: note.id,
        user_id: await userId(),
        path: note.path,
        content: note.content,
        version: note.version,
        deleted: note.deleted,
        created_at: note.createdAt,
        updated_at: note.updatedAt,
      });
      if (error) throw error;
    },

    async listDevices() {
      const { data, error } = await client.from("devices").select("*");
      if (error) throw error;
      return ((data ?? []) as DeviceRow[]).map(
        (row): RemoteDevice => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }),
      );
    },

    async registerDevice(device) {
      // `created_at` and `updated_at` are managed by the schema defaults and
      // the `set_updated_at` trigger, so they are not sent here.
      const { error } = await client.from("devices").upsert({
        id: device.id,
        user_id: await userId(),
        name: device.name,
        kind: device.kind,
      });
      if (error) throw error;
    },
  };
}
