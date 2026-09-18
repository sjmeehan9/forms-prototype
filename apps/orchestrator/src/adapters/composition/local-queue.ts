import path from "node:path";
import { UxpResultSchema, parseWithSchema, type UxpJob, type UxpResult } from "@prototype/contracts";
import { PrototypeError } from "../../domain/models.js";
import { rm } from "node:fs/promises";
import { ensureDir, pathExists, readJson, writeJsonAtomic } from "../../util/fs.js";
import type { CompositionAdapter } from "../types.js";

export const QUEUE_DIRS = ["inbox", "processing", "outbox", "failed"] as const;

export type QueuePaths = { root: string; inbox: string; processing: string; outbox: string; failed: string };

export function queuePaths(home: string): QueuePaths {
  const root = path.join(home, "queue");
  return {
    root,
    inbox: path.join(root, "inbox"),
    processing: path.join(root, "processing"),
    outbox: path.join(root, "outbox"),
    failed: path.join(root, "failed"),
  };
}

export async function ensureQueue(home: string): Promise<QueuePaths> {
  const paths = queuePaths(home);
  for (const dir of QUEUE_DIRS) {
    await ensureDir(paths[dir]);
  }
  return paths;
}

/** Write `<jobId>.tmp` and rename to `<jobId>.json`, so the UXP worker never reads a partial job. */
export async function writeJobAtomic(dir: string, job: UxpJob): Promise<string> {
  const file = path.join(dir, `${job.jobId}.json`);
  await writeJsonAtomic(file, job);
  return file;
}

export async function readResultFile(file: string): Promise<UxpResult> {
  return parseWithSchema(UxpResultSchema, await readJson(file), `UXP result ${path.basename(file)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Hands jobs to the manually started InDesign UXP panel through the file queue and waits for results. */
export class LocalQueueCompositionAdapter implements CompositionAdapter {
  constructor(
    private readonly home: string,
    private readonly timeoutMs: number,
    private readonly pollMs = 500,
  ) {}

  /** Remove any leftover result or failed job file with this id so a re-run cannot read stale output. */
  private async clearStale(paths: QueuePaths, jobId: string): Promise<void> {
    for (const stale of [path.join(paths.outbox, `${jobId}.json`), path.join(paths.failed, `${jobId}.json`), path.join(paths.processing, `${jobId}.json`)]) {
      await rm(stale, { force: true });
    }
  }

  async submit(job: UxpJob): Promise<void> {
    const paths = await ensureQueue(this.home);
    await this.clearStale(paths, job.jobId);
    await writeJobAtomic(paths.inbox, job);
  }

  /** Waits for `outbox/<jobId>.json`, then removes it; the caller keeps the parsed result as evidence. */
  async wait(jobId: string): Promise<UxpResult> {
    const paths = queuePaths(this.home);
    const resultFile = path.join(paths.outbox, `${jobId}.json`);
    const deadline = Date.now() + this.timeoutMs;
    while (!(await pathExists(resultFile))) {
      if (Date.now() > deadline) {
        throw new PrototypeError(
          "compose",
          `timed out after ${this.timeoutMs} ms waiting for UXP result ${jobId}; is InDesign open with the Prototype Queue Worker panel started on ${this.home}?`,
        );
      }
      await sleep(this.pollMs);
    }
    const result = await readResultFile(resultFile);
    if (result.jobId !== jobId) {
      throw new PrototypeError("compose", `UXP result file ${resultFile} carries job id ${result.jobId}, expected ${jobId}`);
    }
    await rm(resultFile, { force: true });
    return result;
  }
}
