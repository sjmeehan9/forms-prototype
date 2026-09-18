import { z } from "zod";
import { parseWithSchema } from "@prototype/contracts";
import type { SourceSnapshot } from "../domain/models.js";
import { pathExists, readJson, writeJsonAtomic } from "../util/fs.js";

const SnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: z.string(),
  inputs: z.record(z.string(), z.string()),
});

const StateFileSchema = z.object({
  schemaVersion: z.literal(1),
  processedRequestIds: z.array(z.string()).default([]),
  lastSuccessfulSnapshot: SnapshotSchema.nullable().default(null),
  lastReleaseId: z.string().nullable().default(null),
});
export type StateFile = z.infer<typeof StateFileSchema>;

/** `.prototype/state.json`: processed request folders plus the last successful source snapshot. */
export class StateStore {
  private data: StateFile = { schemaVersion: 1, processedRequestIds: [], lastSuccessfulSnapshot: null, lastReleaseId: null };

  constructor(readonly filePath: string) {}

  async load(): Promise<void> {
    if (await pathExists(this.filePath)) {
      this.data = parseWithSchema(StateFileSchema, await readJson(this.filePath), "state.json");
    }
  }

  async save(): Promise<void> {
    await writeJsonAtomic(this.filePath, this.data);
  }

  isProcessed(folderId: string): boolean {
    return this.data.processedRequestIds.includes(folderId);
  }

  markProcessed(folderId: string): void {
    if (!this.isProcessed(folderId)) {
      this.data.processedRequestIds.push(folderId);
    }
  }

  get lastSuccessfulSnapshot(): SourceSnapshot | null {
    return this.data.lastSuccessfulSnapshot;
  }

  get lastReleaseId(): string | null {
    return this.data.lastReleaseId;
  }

  setSuccessfulSnapshot(snapshot: SourceSnapshot, releaseId: string): void {
    this.data.lastSuccessfulSnapshot = snapshot;
    this.data.lastReleaseId = releaseId;
  }
}
