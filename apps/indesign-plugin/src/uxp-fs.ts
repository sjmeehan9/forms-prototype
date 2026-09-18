import { storage } from "uxp";

export type Entry = any;

const fs = storage.localFileSystem;

export async function pickFolder(): Promise<Entry | null> {
  try {
    const folder = await fs.getFolder();
    return folder ?? null;
  } catch {
    return null;
  }
}

export function persistFolder(folder: Entry): Promise<string> {
  return fs.createPersistentToken(folder);
}

export function restoreFolder(token: string): Promise<Entry> {
  return fs.getEntryForPersistentToken(token);
}

export function segments(relativePath: string): string[] {
  return relativePath.split("/").filter((segment) => segment !== "" && segment !== ".");
}

export async function getEntry(root: Entry, relativePath: string): Promise<Entry | null> {
  let current = root;
  for (const segment of segments(relativePath)) {
    try {
      current = await current.getEntry(segment);
    } catch {
      return null;
    }
  }
  return current;
}

export async function ensureFolder(root: Entry, relativePath: string): Promise<Entry> {
  let current = root;
  for (const segment of segments(relativePath)) {
    let next: Entry | null = null;
    try {
      next = await current.getEntry(segment);
    } catch {
      next = null;
    }
    if (!next) {
      next = await current.createFolder(segment);
    }
    current = next;
  }
  return current;
}

export function readEntryText(entry: Entry): Promise<string> {
  return entry.read({ format: storage.formats.utf8 });
}

export async function readText(root: Entry, relativePath: string): Promise<string> {
  const entry = await getEntry(root, relativePath);
  if (!entry || !entry.isFile) {
    throw new Error(`file not found in the prototype folder: ${relativePath}`);
  }
  return readEntryText(entry);
}

/** Write `<name>.tmp` then rename, so the Node side never reads a partial result. */
export async function writeTextAtomic(folder: Entry, fileName: string, text: string): Promise<Entry> {
  const tmp = await folder.createFile(`${fileName}.tmp`, { overwrite: true });
  await tmp.write(text, { format: storage.formats.utf8 });
  await tmp.moveTo(folder, { newName: fileName, overwrite: true });
  return tmp;
}

export async function listJsonFiles(folder: Entry): Promise<Entry[]> {
  const entries: Entry[] = await folder.getEntries();
  return entries
    .filter((entry) => entry.isFile && typeof entry.name === "string" && entry.name.endsWith(".json"))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function moveEntry(entry: Entry, folder: Entry, newName?: string): Promise<void> {
  await entry.moveTo(folder, { overwrite: true, ...(newName ? { newName } : {}) });
}

export async function deleteEntry(entry: Entry): Promise<void> {
  await entry.delete();
}

/** Native OS path for InDesign DOM calls; job paths are posix and relative to the granted folder. */
export function nativePathOf(root: Entry, relativePath: string): string {
  const base = String(root.nativePath).replace(/[\\/]+$/, "");
  return `${base}/${segments(relativePath).join("/")}`;
}
