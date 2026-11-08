export interface NoteData {
  id: string;
  done: boolean;
  due: string | null;
  body: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_FILE_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;
const MAX_STEM_BYTES = 180;

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) {
    return value;
  }
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (bytes + size > maxBytes) {
      break;
    }
    result += character;
    bytes += size;
  }
  return result;
}

/** A file name that macOS accepts and Obsidian opens, derived from the Task text. */
export function noteFileName(text: string): string {
  const cleaned = truncateUtf8(
    text.replace(INVALID_FILE_NAME, " ").replace(/\s+/g, " ").trim(),
    MAX_STEM_BYTES,
  )
    .replace(/^[. ]+/, "")
    .replace(/[. ]+$/, "");
  return `${cleaned === "" ? "Untitled" : cleaned}.md`;
}

export function joinPath(folder: string, fileName: string): string {
  return `${folder.replace(/\/+$/, "")}/${fileName}`;
}

/**
 * The Note's path inside the Vault, without the Vault folder prefix. Notes are
 * synced by this relative path so a Home and a Satellite can each resolve it
 * against their own Vault root.
 */
export function relativePath(vaultPath: string, absPath: string): string {
  const root = vaultPath.replace(/\/+$/, "");
  if (absPath === root) {
    return "";
  }
  if (absPath.startsWith(`${root}/`)) {
    return absPath.slice(root.length + 1);
  }
  return absPath;
}

/** Resolves a Vault-relative Note path against a device's own Vault folder. */
export function resolvePath(vaultPath: string, relative: string): string {
  if (relative === "") {
    return vaultPath.replace(/\/+$/, "");
  }
  return `${vaultPath.replace(/\/+$/, "")}/${relative}`;
}

/**
 * The Conflict copy path for a Note: `Note.md` becomes `Note (conflito).md`,
 * keeping any subfolder.
 */
export function conflictCopyPath(path: string): string {
  const separator = path.lastIndexOf("/");
  const folder = separator === -1 ? "" : path.slice(0, separator + 1);
  const name = separator === -1 ? path : path.slice(separator + 1);
  const stem = name.replace(/\.md$/i, "");
  return `${folder}${stem} (conflito).md`;
}

export function formatNote(note: NoteData): string {
  const lines = [
    "---",
    `id: ${note.id}`,
    `done: ${note.done ? "true" : "false"}`,
    note.due === null ? "due:" : `due: ${note.due}`,
    "---",
  ];
  const frontmatter = `${lines.join("\n")}\n`;
  return note.body === "" ? frontmatter : `${frontmatter}\n${note.body}`;
}

/**
 * Reads the frontmatter and the free-form body of a Note.
 * Returns null when the file is not one of our Notes (no frontmatter or no id).
 */
export function parseNote(content: string): NoteData | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (match === null) {
    return null;
  }

  const fields = new Map<string, string>();
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    fields.set(key, value);
  }

  const id = fields.get("id") ?? "";
  if (id === "") {
    return null;
  }

  let body = content.slice(match[0].length);
  // The blank line after the closing `---` is a separator, not body text.
  body = body.replace(/^\r?\n/, "");

  const due = fields.get("due") ?? "";
  return {
    id,
    done: (fields.get("done") ?? "").toLowerCase() === "true",
    due: DAY_PATTERN.test(due) ? due : null,
    body,
  };
}
