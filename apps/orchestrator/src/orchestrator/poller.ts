import { errorMessage } from "../domain/models.js";
import type { RunContext } from "./context.js";
import { runRequest, type RunOutcome } from "./run-request.js";

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Process every request currently waiting, in name order, and return their outcomes. */
export async function drainRequests(ctx: RunContext): Promise<RunOutcome[]> {
  const outcomes: RunOutcome[] = [];
  for (;;) {
    const ref = await ctx.orchestration.nextRequest();
    if (!ref) {
      return outcomes;
    }
    outcomes.push(await runRequest(ctx, ref));
  }
}

/** Poll for requests until aborted. Errors in polling are logged and retried on the next tick. */
export async function watch(ctx: RunContext, options: { signal: AbortSignal }): Promise<void> {
  const { config, log } = ctx;
  log.info(`watching for requests every ${config.pollIntervalMs} ms (storage ${config.storageMode}, composition ${config.compositionMode}); press Ctrl+C to stop`);
  while (!options.signal.aborted) {
    try {
      const ref = await ctx.orchestration.nextRequest();
      if (ref) {
        await runRequest(ctx, ref);
        continue;
      }
    } catch (error) {
      log.error(`polling failed: ${errorMessage(error)}`);
    }
    await sleep(config.pollIntervalMs, options.signal);
  }
  log.info("stopped watching");
}
