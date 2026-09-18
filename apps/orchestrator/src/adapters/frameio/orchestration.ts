import { PrototypeError } from "../../domain/models.js";
import { FolderOrchestrationAdapter } from "../folder-orchestration.js";
import type { StorageAdapter } from "../types.js";
import type { FrameioLayout } from "./layout.js";

/** Frame.io request-state folders under `00 Requests`. Metadata triggers remain a documented option only. */
export class FrameioOrchestrationAdapter extends FolderOrchestrationAdapter {
  constructor(storage: StorageAdapter, layout: FrameioLayout, isProcessed: (folderId: string) => boolean) {
    if (layout.triggerMode === "metadata") {
      throw new PrototypeError("config", "metadata trigger mode is not implemented in this prototype; set TRIGGER_MODE=folder and re-run bootstrap");
    }
    super(storage, layout.folders.states, isProcessed);
  }
}
