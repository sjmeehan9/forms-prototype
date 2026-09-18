import type { BuildState, UxpJob, UxpResult } from "@prototype/contracts";

export type StoredItemType = "file" | "folder";

export type StoredItem = {
  id: string;
  name: string;
  type: StoredItemType;
  parentId?: string;
  fileSize?: number;
  updatedAt?: string;
  version?: string;
};

export type StoredFile = StoredItem & { type: "file"; localPath?: string; sha256?: string };

export interface StorageAdapter {
  listChildren(parentId: string): Promise<StoredItem[]>;
  /** Creates the folder, or returns the existing child folder with that name. */
  createFolder(parentId: string, name: string): Promise<StoredItem>;
  stat(itemId: string): Promise<StoredItem>;
  download(fileId: string, destination: string): Promise<StoredFile>;
  upload(parentId: string, sourcePath: string): Promise<StoredFile>;
  /** Moves the item and returns its updated descriptor; path-based adapters change the id. */
  move(item: StoredItem, parentId: string): Promise<StoredItem>;
}

export type BuildRequestRef = { requestId: string; folder: StoredItem };

export interface OrchestrationAdapter {
  nextRequest(): Promise<BuildRequestRef | null>;
  findRequest(requestId: string): Promise<BuildRequestRef | null>;
  claim(request: BuildRequestRef): Promise<void>;
  setState(request: BuildRequestRef, state: BuildState, detail?: string): Promise<void>;
}

export interface CompositionAdapter {
  submit(job: UxpJob): Promise<void>;
  wait(jobId: string): Promise<UxpResult>;
}
