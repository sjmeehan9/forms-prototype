import path from "node:path";
import { Command } from "commander";
import { ensureTlsCertificate, createTokenProvider, runLoginFlow, saveTokens } from "./adapters/frameio/auth.js";
import { FrameioClient } from "./adapters/frameio/client.js";
import { loadConfig, requireFrameioCredentials } from "./config.js";
import { errorDetails, errorMessage } from "./domain/models.js";
import { createLogger } from "./log.js";
import { bootstrapFrameio } from "./orchestrator/bootstrap-frameio.js";
import { createContext } from "./orchestrator/context.js";
import { assertExpectedE2E, runFixtureE2E } from "./orchestrator/fixture-e2e.js";
import { watch } from "./orchestrator/poller.js";
import { probeFrameio } from "./orchestrator/probe-frameio.js";
import { runRequest, type RunOutcome } from "./orchestrator/run-request.js";
import { APPLICATION_VERSION } from "./version.js";

const log = createLogger();
const program = new Command();

program
  .name("prototype")
  .description("Mock Workfront orchestration and composition for the Adobe-based Keystone alternative prototype")
  .version(APPLICATION_VERSION)
  .option("--home <dir>", "prototype home folder (overrides PROTOTYPE_HOME)")
  .option("--storage <mode>", "frameio | local (overrides STORAGE_MODE)")
  .option("--composition <mode>", "uxp | dry-run | firefly (overrides COMPOSITION_MODE)");

function overrides(): Record<string, string | undefined> {
  const options = program.opts<{ home?: string; storage?: string; composition?: string }>();
  return { PROTOTYPE_HOME: options.home, STORAGE_MODE: options.storage, COMPOSITION_MODE: options.composition };
}

function printOutcome(outcome: RunOutcome): void {
  const rebuilt = outcome.rebuilt.map((t) => `${t.documentId}/${t.brandId}`).join(", ") || "none";
  const skipped = outcome.skipped.map((t) => `${t.documentId}/${t.brandId}`).join(", ") || "none";
  log.info(`${outcome.requestFolder}: ${outcome.status}${outcome.releaseId ? ` (${outcome.releaseId})` : ""}`);
  log.info(`  rebuilt: ${rebuilt}`);
  log.info(`  skipped: ${skipped}`);
  if (outcome.error) {
    log.info(`  error in ${outcome.stage ?? "unknown"}: ${outcome.error}`);
    for (const detail of outcome.details) {
      log.info(`    - ${detail}`);
    }
  }
}

program
  .command("watch")
  .description("Poll the Ready to generate folder and process requests one at a time")
  .action(async () => {
    const config = await loadConfig({ overrides: overrides() });
    const ctx = await createContext(config, log);
    const controller = new AbortController();
    process.once("SIGINT", () => {
      log.info("stopping after the current request");
      controller.abort();
    });
    await watch(ctx, { signal: controller.signal });
  });

program
  .command("run <request-id>")
  .description("Process one request folder by name")
  .action(async (requestId: string) => {
    const config = await loadConfig({ overrides: overrides() });
    const ctx = await createContext(config, log);
    const ref = await ctx.orchestration.findRequest(requestId);
    if (!ref) {
      throw new Error(`request folder ${requestId} was not found in any state folder`);
    }
    const outcome = await runRequest(ctx, ref);
    printOutcome(outcome);
    process.exitCode = outcome.status === "completed" ? 0 : 1;
  });

program
  .command("auth-frameio")
  .description("Sign in to Adobe with the browser and save a refreshable Frame.io session")
  .option("--no-open", "print the sign-in URL instead of opening the browser")
  .action(async (options: { open: boolean }) => {
    const config = await loadConfig({ overrides: overrides() });
    const credentials = requireFrameioCredentials(config);
    const tls = await ensureTlsCertificate(config.tlsCertFile, config.tlsKeyFile, log);
    const tokens = await runLoginFlow(credentials, { tls, openBrowser: options.open, log });
    await saveTokens(config.home, tokens);
    const client = new FrameioClient(createTokenProvider(credentials, config.home, log));
    const me = await client.me();
    log.info(`signed in as ${me.name}; session saved to ${path.join(config.home, "auth.json")} (access token expires ${tokens.expiresAt}, refreshable)`);
  });

program
  .command("bootstrap-frameio")
  .description("Discover the Frame.io account, workspace and project, then create the folder layout")
  .action(async () => {
    const config = await loadConfig({ overrides: overrides() });
    const layout = await bootstrapFrameio(config, log);
    log.info(`layout saved to ${path.join(config.home, "frameio.json")} (trigger mode ${layout.triggerMode})`);
    for (const [name, id] of Object.entries(layout.folders.states)) {
      log.info(`  state folder ${name}: ${id}`);
    }
  });

program
  .command("probe-frameio")
  .description("Prove upload, list, download, hash comparison and moves with one synthetic file; record optional features")
  .option("--keep", "keep the probe folder in Frame.io instead of deleting it", false)
  .action(async (options: { keep: boolean }) => {
    const config = await loadConfig({ overrides: overrides() });
    const results = await probeFrameio(config, log, { keep: options.keep });
    log.info(JSON.stringify(results, null, 2));
  });

program
  .command("fixture-e2e")
  .description("Run three synthetic requests through the local store with dry-run composition; needs no Adobe or Frame.io access")
  .action(async () => {
    const config = await loadConfig({ overrides: overrides() });
    const report = await runFixtureE2E({ rootDir: config.rootDir, fixtureStore: config.fixtureStore, home: path.join(config.home, "fixture-e2e"), log });
    for (const outcome of report.runs) {
      printOutcome(outcome);
    }
    await assertExpectedE2E(report);
    log.info(`fixture E2E passed; inspect ${report.storeRoot}`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  log.error(errorMessage(error));
  for (const detail of errorDetails(error)) {
    log.error(`  - ${detail}`);
  }
  process.exit(1);
});
