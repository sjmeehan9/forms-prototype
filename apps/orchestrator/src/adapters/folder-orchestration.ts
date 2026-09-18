import { BUILD_STATES, type BuildState } from "@prototype/contracts";
import { compareStrings } from "../domain/hash.js";
import type { BuildRequestRef, OrchestrationAdapter, StorageAdapter, StoredItem } from "./types.js";

export type StateFolderIds = Record<BuildState, string>;

/**
 * Folder-based state machine: a request is a folder that moves between the four state folders.
 * Works over any StorageAdapter, so the local store and Frame.io share one implementation.
 */
export class FolderOrchestrationAdapter implements OrchestrationAdapter {
  constructor(
    protected readonly storage: StorageAdapter,
    protected readonly stateFolders: StateFolderIds,
    private readonly isProcessed: (folderId: string) => boolean,
  ) {}

  private toRef(folder: StoredItem): BuildRequestRef {
    return { requestId: folder.name, folder };
  }

  async nextRequest(): Promise<BuildRequestRef | null> {
    const children = await this.storage.listChildren(this.stateFolders["Ready to generate"]);
    const candidates = children
      .filter((item) => item.type === "folder" && !this.isProcessed(item.id))
      .sort((a, b) => compareStrings(a.name, b.name));
    const [first] = candidates;
    return first ? this.toRef(first) : null;
  }

  async findRequest(requestId: string): Promise<BuildRequestRef | null> {
    for (const state of BUILD_STATES) {
      const children = await this.storage.listChildren(this.stateFolders[state]);
      const match = children.find((item) => item.type === "folder" && item.name === requestId);
      if (match) {
        return this.toRef(match);
      }
    }
    return null;
  }

  async claim(request: BuildRequestRef): Promise<void> {
    await this.setState(request, "Generating");
  }

  async setState(request: BuildRequestRef, state: BuildState): Promise<void> {
    const target = this.stateFolders[state];
    if (request.folder.parentId === target) {
      return;
    }
    request.folder = await this.storage.move(request.folder, target);
  }
}
