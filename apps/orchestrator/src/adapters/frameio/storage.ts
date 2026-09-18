import { createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { compareStrings } from "../../domain/hash.js";
import { PrototypeError } from "../../domain/models.js";
import type { Logger } from "../../log.js";
import { ensureDir, fileSize, sha256File } from "../../util/fs.js";
import type { StorageAdapter, StoredFile, StoredItem } from "../types.js";
import { FrameioApiError, FrameioClient, type FrameioNode } from "./client.js";

const UPLOAD_COMPLETION_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FrameioStorageAdapter implements StorageAdapter {
  constructor(
    private readonly client: FrameioClient,
    readonly accountId: string,
    private readonly log: Logger,
  ) {}

  private toItem(node: FrameioNode): StoredItem {
    return {
      id: node.id,
      name: node.name,
      type: node.type === "folder" ? "folder" : "file",
      parentId: node.parent_id ?? undefined,
      fileSize: node.file_size,
      updatedAt: node.updated_at,
      version: node.adobe_version_id ?? node.updated_at,
    };
  }

  async listChildren(parentId: string): Promise<StoredItem[]> {
    const nodes = await this.client.folderChildren(this.accountId, parentId);
    const items: StoredItem[] = [];
    for (const node of nodes) {
      if (node.type === "version_stack") {
        this.log.warn(`skipping version stack ${node.name}; version stacks are outside the prototype scope`);
        continue;
      }
      items.push(this.toItem(node));
    }
    return items.sort((a, b) => compareStrings(a.name, b.name));
  }

  async createFolder(parentId: string, name: string): Promise<StoredItem> {
    const existing = (await this.listChildren(parentId)).find((item) => item.type === "folder" && item.name === name);
    if (existing) {
      return existing;
    }
    const node = await this.client.createFolder(this.accountId, parentId, name);
    return { ...this.toItem(node), type: "folder", parentId };
  }

  async stat(itemId: string): Promise<StoredItem> {
    try {
      return this.toItem(await this.client.file(this.accountId, itemId));
    } catch (error) {
      if (error instanceof FrameioApiError && [400, 404, 422].includes(error.status)) {
        return { ...this.toItem(await this.client.folder(this.accountId, itemId)), type: "folder" };
      }
      throw error;
    }
  }

  async download(fileId: string, destination: string): Promise<StoredFile> {
    const node = await this.client.file(this.accountId, fileId, "media_links.original");
    const url = node.media_links?.original?.download_url;
    if (!url) {
      throw new PrototypeError("download", `Frame.io returned no original download link for ${node.name} (${fileId}); file status is ${node.status ?? "unknown"}`);
    }
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new PrototypeError("download", `download of ${node.name} failed with HTTP ${response.status}`);
    }
    await ensureDir(path.dirname(destination));
    await pipeline(Readable.fromWeb(response.body as unknown as WebReadableStream), createWriteStream(destination));
    return { ...this.toItem(node), type: "file", localPath: destination, sha256: await sha256File(destination) };
  }

  async upload(parentId: string, sourcePath: string): Promise<StoredFile> {
    const name = path.basename(sourcePath);
    const size = await fileSize(sourcePath);
    const target = await this.client.createLocalUpload(this.accountId, parentId, name, size);
    const parts = target.upload_urls ?? [];
    if (size > 0 && parts.length === 0) {
      throw new PrototypeError("upload", `Frame.io returned no upload URLs for ${name}`);
    }
    const handle = await open(sourcePath, "r");
    try {
      let offset = 0;
      for (const [index, part] of parts.entries()) {
        const chunk = new Uint8Array(new ArrayBuffer(part.size));
        const { bytesRead } = await handle.read(chunk, 0, part.size, offset);
        offset += bytesRead;
        const response = await fetch(part.url, {
          method: "PUT",
          headers: { "Content-Type": target.media_type ?? "application/octet-stream", "x-amz-acl": "private" },
          body: chunk.subarray(0, bytesRead),
        });
        if (!response.ok) {
          throw new PrototypeError("upload", `part ${index + 1} of ${parts.length} for ${name} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
        }
      }
    } finally {
      await handle.close();
    }
    const deadline = Date.now() + UPLOAD_COMPLETION_TIMEOUT_MS;
    for (;;) {
      const status = await this.client.uploadStatus(this.accountId, target.id);
      if (status.upload_failed) {
        throw new PrototypeError("upload", `Frame.io reported the upload of ${name} as failed`);
      }
      if (status.upload_complete) {
        break;
      }
      if (Date.now() > deadline) {
        throw new PrototypeError("upload", `Frame.io did not confirm the upload of ${name} within ${UPLOAD_COMPLETION_TIMEOUT_MS} ms`);
      }
      await sleep(1000);
    }
    return { id: target.id, name, type: "file", parentId, fileSize: size, localPath: sourcePath, sha256: await sha256File(sourcePath) };
  }

  async move(item: StoredItem, parentId: string): Promise<StoredItem> {
    if (item.type === "folder") {
      await this.client.moveFolder(this.accountId, item.id, parentId);
    } else {
      await this.client.moveFile(this.accountId, item.id, parentId);
    }
    return { ...item, parentId };
  }
}
