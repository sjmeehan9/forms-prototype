import { app } from "indesign";
import type { UxpJob, UxpResult } from "@prototype/contracts";
import { composeDocument } from "./compose";
import { extractContent } from "./extract-content";
import { failedResult, messageOf, parseJobText } from "./text-model";
import { deleteEntry, ensureFolder, getEntry, listJsonFiles, moveEntry, readEntryText, writeTextAtomic, type Entry } from "./uxp-fs";

export type WorkerStatus = {
  state: "stopped" | "idle" | "working";
  currentJob: string | null;
  lastResult: string;
  processed: number;
};

export type StatusListener = (status: WorkerStatus) => void;

const IDLE_TASK_NAME = "prototype-queue-worker";
const IDLE_SLEEP_MS = 2000;

/** One idle task scans queue/inbox every two seconds and processes one job at a time. */
export class QueueWorker {
  private task: any = null;
  private busy = false;
  private root: Entry | null = null;
  private status: WorkerStatus = { state: "stopped", currentJob: null, lastResult: "none", processed: 0 };

  constructor(private readonly listener: StatusListener) {}

  setRoot(root: Entry): void {
    this.root = root;
  }

  get isRunning(): boolean {
    return this.task !== null;
  }

  private update(patch: Partial<WorkerStatus>): void {
    this.status = { ...this.status, ...patch };
    this.listener(this.status);
  }

  start(): void {
    if (!this.root) {
      throw new Error("select the .prototype folder first");
    }
    if (this.task) {
      return;
    }
    this.task = app.idleTasks.add({ name: IDLE_TASK_NAME, sleep: IDLE_SLEEP_MS });
    this.task.addEventListener("onIdle", () => {
      void this.tick();
    });
    this.update({ state: "idle", lastResult: "worker ready" });
  }

  stop(): void {
    if (this.task) {
      try {
        this.task.remove();
      } catch {
        // The task may already be gone when InDesign is shutting down.
      }
      this.task = null;
    }
    this.update({ state: "stopped", currentJob: null });
  }

  async tick(): Promise<void> {
    if (this.busy || !this.root) {
      return;
    }
    this.busy = true;
    try {
      await this.processNext(this.root);
    } catch (error) {
      this.update({ state: "idle", currentJob: null, lastResult: `worker error: ${messageOf(error)}` });
    } finally {
      this.busy = false;
    }
  }

  private async processNext(root: Entry): Promise<void> {
    const inbox = await ensureFolder(root, "queue/inbox");
    const processing = await ensureFolder(root, "queue/processing");
    const outbox = await ensureFolder(root, "queue/outbox");
    const failed = await ensureFolder(root, "queue/failed");
    const [jobFile] = await listJsonFiles(inbox);
    if (!jobFile) {
      return;
    }
    const jobFileName = String(jobFile.name);
    let job: UxpJob;
    try {
      job = parseJobText(await readEntryText(jobFile));
    } catch (error) {
      await moveEntry(jobFile, failed);
      this.update({ lastResult: `rejected ${jobFileName}: ${messageOf(error)}` });
      return;
    }
    await moveEntry(jobFile, processing);
    this.update({ state: "working", currentJob: job.jobId });

    let result: UxpResult;
    try {
      result = job.type === "extract-content" ? await extractContent(root, job) : await composeDocument(root, job);
    } catch (error) {
      result = failedResult(job.jobId, messageOf(error));
    }
    await writeTextAtomic(outbox, `${job.jobId}.json`, JSON.stringify(result, null, 2));

    const processed = await getEntry(root, `queue/processing/${jobFileName}`);
    if (processed) {
      if (result.status === "completed") {
        await deleteEntry(processed);
      } else {
        await moveEntry(processed, failed);
      }
    }
    this.update({
      state: "idle",
      currentJob: null,
      processed: this.status.processed + 1,
      lastResult: `${job.jobId}: ${result.status}${result.error ? ` (${result.error})` : ""}`,
    });
  }
}
