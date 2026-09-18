import path from "node:path";
import type { UxpJob, UxpResult } from "@prototype/contracts";
import { LocalQueueCompositionAdapter } from "../adapters/composition/local-queue.js";
import { LOCAL_FOLDERS, ensureLocalStore } from "../adapters/local/orchestration.js";
import type { AppConfig } from "../config.js";
import { PrototypeError } from "../domain/models.js";
import type { Logger } from "../log.js";
import { toPosix } from "../util/fs.js";

const SAMPLES_TIMEOUT_MS = 600_000;

/**
 * Queue a `create-samples` job for the InDesign panel: it builds a real content library and templates from
 * the fixture register and manifests directly into the local store, replacing the text placeholders.
 */
export async function createSamples(config: AppConfig, log: Logger): Promise<UxpResult> {
  await ensureLocalStore(config.localStorageRoot, config.fixtureStore, { reset: false });
  const store = config.localStorageRoot;
  const jobPath = (absolutePath: string): string => {
    const relative = path.relative(config.home, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new PrototypeError("samples", `${absolutePath} is outside the prototype home ${config.home}; keep LOCAL_STORAGE_ROOT inside PROTOTYPE_HOME`);
    }
    return toPosix(relative);
  };
  const job: UxpJob = {
    schemaVersion: 1,
    jobId: `create-samples-${Date.now()}`,
    type: "create-samples",
    register: jobPath(path.join(store, LOCAL_FOLDERS.sourceContent, "component-register.json")),
    manifestDir: jobPath(path.join(store, LOCAL_FOLDERS.templatesAndAssets, "document-manifests")),
    brandDir: jobPath(path.join(store, LOCAL_FOLDERS.templatesAndAssets, "brands")),
    libraryOutput: jobPath(path.join(store, LOCAL_FOLDERS.sourceContent, "content-library.indd")),
    templateOutputDir: jobPath(path.join(store, LOCAL_FOLDERS.templatesAndAssets, "templates")),
  };
  const queue = new LocalQueueCompositionAdapter(config.home, Math.max(config.uxpJobTimeoutMs, SAMPLES_TIMEOUT_MS));
  log.info(`queued ${job.jobId}; waiting for the InDesign panel started on ${config.home}`);
  await queue.submit(job);
  const result = await queue.wait(job.jobId);
  if (result.status !== "completed") {
    throw new PrototypeError("samples", `InDesign could not create the sample documents: ${result.error ?? "no detail"}`, result.notes ?? []);
  }
  return result;
}
