import { copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { LayoutSpecSchema, parseWithSchema, type UxpJob, type UxpResult } from "@prototype/contracts";
import { LocalQueueCompositionAdapter } from "../adapters/composition/local-queue.js";
import { LOCAL_FOLDERS, ensureLocalStore } from "../adapters/local/orchestration.js";
import type { AppConfig } from "../config.js";
import { PrototypeError } from "../domain/models.js";
import type { Logger } from "../log.js";
import { ensureDir, pathExists, readJson, toPosix } from "../util/fs.js";

const BUILD_TIMEOUT_MS = 900_000;

export type BuildDemoResult = { outputs: string[]; notes: string[] };

/**
 * Ask the running InDesign panel to build the content library from the store's component register and one
 * controlled template per layout spec, writing them into the local store in place of the text placeholders.
 * Layout specs live beside the store (`<store>/../layouts`) and are staged under the prototype home so the
 * panel can read them.
 */
export async function buildDemo(config: AppConfig, log: Logger): Promise<BuildDemoResult> {
  await ensureLocalStore(config.localStorageRoot, config.fixtureStore, { reset: false });
  const layoutsDir = path.join(path.dirname(config.fixtureStore), "layouts");
  if (!(await pathExists(layoutsDir))) {
    throw new PrototypeError("build", `no layouts folder beside the store: ${layoutsDir}`);
  }
  const jobPath = (absolutePath: string): string => {
    const relative = path.relative(config.home, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new PrototypeError("build", `${absolutePath} is outside the prototype home ${config.home}; keep LOCAL_STORAGE_ROOT inside PROTOTYPE_HOME`);
    }
    return toPosix(relative);
  };

  const stageDir = path.join(config.home, "demo-build", "layouts");
  await ensureDir(stageDir);
  const store = config.localStorageRoot;
  const stamp = Date.now();
  const jobs: UxpJob[] = [
    {
      schemaVersion: 1,
      jobId: `build-library-${stamp}`,
      type: "build-library",
      register: jobPath(path.join(store, LOCAL_FOLDERS.sourceContent, "component-register.json")),
      output: jobPath(path.join(store, LOCAL_FOLDERS.sourceContent, "content-library.indd")),
    },
  ];
  for (const file of (await readdir(layoutsDir)).filter((name) => name.endsWith(".layout.json")).sort()) {
    const layout = parseWithSchema(LayoutSpecSchema, await readJson(path.join(layoutsDir, file)), file);
    const staged = path.join(stageDir, file);
    await copyFile(path.join(layoutsDir, file), staged);
    jobs.push({
      schemaVersion: 1,
      jobId: `build-template-${layout.documentId}-${stamp}`,
      type: "build-template",
      layout: jobPath(staged),
      output: jobPath(path.join(store, LOCAL_FOLDERS.templatesAndAssets, "templates", layout.templateId)),
    });
  }

  const queue = new LocalQueueCompositionAdapter(config.home, Math.max(config.uxpJobTimeoutMs, BUILD_TIMEOUT_MS));
  const outputs: string[] = [];
  const notes: string[] = [];
  for (const job of jobs) {
    log.info(`queued ${job.jobId}; waiting for the InDesign panel started on ${config.home}`);
    await queue.submit(job);
    const result: UxpResult = await queue.wait(job.jobId);
    if (result.status !== "completed") {
      throw new PrototypeError("build", `InDesign could not finish ${job.jobId}: ${result.error ?? "no detail"}`, result.notes ?? []);
    }
    outputs.push(...result.outputs);
    notes.push(...(result.notes ?? []));
    log.info(`  done: ${result.outputs.join(", ")}`);
  }
  return { outputs, notes };
}
