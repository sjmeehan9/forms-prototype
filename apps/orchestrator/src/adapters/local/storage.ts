import { copyFile, mkdir, readdir, rename, stat as fsStat } from "node:fs/promises";
import path from "node:path";
import { PrototypeError } from "../../domain/models.js";
import { compareStrings } from "../../domain/hash.js";
import { ensureDir, sha256File } from "../../util/fs.js";
import type { StorageAdapter, StoredFile, StoredItem } from "../types.js";

function normalizeId(id: string): string {
  const normalized = path.posix.normalize(id === "" ? "." : id.split(path.sep).join("/"));
  return normalized === "." ? "" : normalized.replace(/\/+$/, "");
}

/** Storage adapter over a local folder tree. Item ids are posix paths relative to the root. */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(readonly rootDir: string) {}

  absolutePath(id: string): string {
    const normalized = normalizeId(id);
    if (normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
      throw new PrototypeError("storage", `local storage id escapes the store root: ${id}`);
    }
    return normalized === "" ? this.rootDir : path.join(this.rootDir, ...normalized.split("/"));
  }

  private childId(parentId: string, name: string): string {
    const parent = normalizeId(parentId);
    return parent === "" ? name : `${parent}/${name}`;
  }

  async listChildren(parentId: string): Promise<StoredItem[]> {
    const dir = this.absolutePath(parentId);
    const entries = await readdir(dir, { withFileTypes: true });
    const items: StoredItem[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (entry.isDirectory()) {
        items.push({ id: this.childId(parentId, entry.name), name: entry.name, type: "folder", parentId: normalizeId(parentId) });
      } else if (entry.isFile()) {
        items.push(await this.stat(this.childId(parentId, entry.name)));
      }
    }
    return items.sort((a, b) => compareStrings(a.name, b.name));
  }

  async createFolder(parentId: string, name: string): Promise<StoredItem> {
    const id = this.childId(parentId, name);
    await mkdir(this.absolutePath(id), { recursive: true });
    return { id, name, type: "folder", parentId: normalizeId(parentId) };
  }

  async stat(itemId: string): Promise<StoredItem> {
    const id = normalizeId(itemId);
    const info = await fsStat(this.absolutePath(id));
    const parent = path.posix.dirname(id);
    return {
      id,
      name: path.posix.basename(id),
      type: info.isDirectory() ? "folder" : "file",
      parentId: parent === "." ? "" : parent,
      fileSize: info.isDirectory() ? undefined : info.size,
      updatedAt: info.mtime.toISOString(),
      version: info.isDirectory() ? undefined : info.mtime.toISOString(),
    };
  }

  async download(fileId: string, destination: string): Promise<StoredFile> {
    const info = await this.stat(fileId);
    if (info.type !== "file") {
      throw new PrototypeError("storage", `${fileId} is a folder, not a file`);
    }
    await ensureDir(path.dirname(destination));
    await copyFile(this.absolutePath(fileId), destination);
    return { ...info, type: "file", localPath: destination, sha256: await sha256File(destination) };
  }

  async upload(parentId: string, sourcePath: string): Promise<StoredFile> {
    const id = this.childId(parentId, path.basename(sourcePath));
    const destination = this.absolutePath(id);
    await ensureDir(path.dirname(destination));
    await copyFile(sourcePath, destination);
    const info = await this.stat(id);
    return { ...info, type: "file", localPath: destination, sha256: await sha256File(destination) };
  }

  async move(item: StoredItem, parentId: string): Promise<StoredItem> {
    const targetId = this.childId(parentId, item.name);
    await ensureDir(this.absolutePath(parentId));
    await rename(this.absolutePath(item.id), this.absolutePath(targetId));
    return { ...item, id: targetId, parentId: normalizeId(parentId) };
  }
}
