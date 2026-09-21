import { rm } from "node:fs/promises";
import path from "node:path";
import { LocalQueueCompositionAdapter, queuePaths } from "../adapters/composition/local-queue.js";
import type { AppConfig } from "../config.js";
import { PrototypeError } from "../domain/models.js";
import type { Logger } from "../log.js";

const PING_TIMEOUT_MS = 20_000;

/** Fail fast when the InDesign panel is not running, or is an older build that does not know the ping job. */
export async function pingPanel(config: AppConfig, log: Logger): Promise<string[]> {
  const queue = new LocalQueueCompositionAdapter(config.home, PING_TIMEOUT_MS, 250);
  const jobId = `ping-${Date.now()}`;
  await queue.submit({ schemaVersion: 1, jobId, type: "ping" });
  try {
    const result = await queue.wait(jobId);
    const notes = result.notes ?? [];
    log.info(`InDesign panel is responding (${notes.join(", ") || "no build details"})`);
    return notes;
  } catch {
    await rm(path.join(queuePaths(config.home).inbox, `${jobId}.json`), { force: true });
    throw new PrototypeError(
      "panel",
      `the InDesign panel did not answer within ${PING_TIMEOUT_MS / 1000} s`,
      ["Open InDesign and the Prototype Queue Worker panel, select the .prototype folder and click Start worker.", "If the panel is open, reload the plugin in UXP Developer Tool so it runs the current build."],
    );
  }
}
