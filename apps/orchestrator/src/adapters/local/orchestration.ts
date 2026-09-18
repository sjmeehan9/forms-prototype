import path from "node:path";
import type { BuildRequestSource } from "@prototype/contracts";
import { PrototypeError } from "../../domain/models.js";
import { copyDir, ensureDir, pathExists, removeDir } from "../../util/fs.js";
import { FolderOrchestrationAdapter, type StateFolderIds } from "../folder-orchestration.js";
import type { LocalStorageAdapter } from "./storage.js";

export const LOCAL_FOLDERS = {
  requests: "00 Requests",
  sourceContent: "01 Source content",
  templatesAndAssets: "02 Templates and assets",
  generatedVariants: "03 Generated variants",
  reviewAndApproved: "04 Review and approved",
} as const;

export function localStateFolders(): StateFolderIds {
  return {
    "Ready to generate": `${LOCAL_FOLDERS.requests}/Ready to generate`,
    Generating: `${LOCAL_FOLDERS.requests}/Generating`,
    "Ready for review": `${LOCAL_FOLDERS.requests}/Ready for review`,
    Failed: `${LOCAL_FOLDERS.requests}/Failed`,
  };
}

export const LOCAL_REQUEST_DEFAULTS: BuildRequestSource = {
  contentLibraryFileId: `${LOCAL_FOLDERS.sourceContent}/content-library.indd`,
  dataFileId: `${LOCAL_FOLDERS.sourceContent}/product-data.csv`,
  manifestFolderId: `${LOCAL_FOLDERS.templatesAndAssets}/document-manifests`,
  templateFolderId: `${LOCAL_FOLDERS.templatesAndAssets}/templates`,
  assetFolderId: `${LOCAL_FOLDERS.templatesAndAssets}/assets`,
  brandFolderId: `${LOCAL_FOLDERS.templatesAndAssets}/brands`,
};

export class LocalOrchestrationAdapter extends FolderOrchestrationAdapter {
  constructor(storage: LocalStorageAdapter, isProcessed: (folderId: string) => boolean) {
    super(storage, localStateFolders(), isProcessed);
  }
}

/** Seed the mutable local store from the pristine fixture store; the fixture itself is never modified. */
export async function ensureLocalStore(rootDir: string, fixtureDir: string, options: { reset: boolean }): Promise<void> {
  if (options.reset) {
    await removeDir(rootDir);
  }
  if (!(await pathExists(rootDir))) {
    if (!(await pathExists(fixtureDir))) {
      throw new PrototypeError("config", `fixture store not found at ${fixtureDir}`);
    }
    await copyDir(fixtureDir, rootDir);
  }
  for (const folder of Object.values(localStateFolders())) {
    await ensureDir(path.join(rootDir, ...folder.split("/")));
  }
  await ensureDir(path.join(rootDir, LOCAL_FOLDERS.generatedVariants));
}
