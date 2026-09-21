import path from "node:path";
import { Command } from "commander";
import { ensureTlsCertificate, createTokenProvider, runLoginFlow, saveTokens } from "./adapters/frameio/auth.js";
import { FrameioClient } from "./adapters/frameio/client.js";
import { loadConfig, requireFrameioCredentials } from "./config.js";
import { errorDetails, errorMessage } from "./domain/models.js";
import { createLogger } from "./log.js";
import { bootstrapFrameio } from "./orchestrator/bootstrap-frameio.js";
import { buildDemo } from "./orchestrator/build-demo.js";
import { createContext } from "./orchestrator/context.js";
import { createSamples } from "./orchestrator/create-samples.js";
import { assertExpectedE2E, runFixtureE2E } from "./orchestrator/fixture-e2e.js";
import { pingPanel } from "./orchestrator/ping-panel.js";
import { watch } from "./orchestrator/poller.js";
import { probeFrameio } from "./orchestrator/probe-frameio.js";
import { requestFrameio } from "./orchestrator/request-frameio.js";
import { runRequest, type RunOutcome } from "./orchestrator/run-request.js";
import { listFrameio } from "./orchestrator/list-frameio.js";
import { seedFrameio } from "./orchestrator/seed-frameio.js";
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
    if (config.compositionMode === "uxp") {
      await pingPanel(config, log);
    }
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
    if (config.compositionMode === "uxp") {
      await pingPanel(config, log);
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
  .command("seed-frameio")
  .description("Upload the synthetic fixture source package into the Frame.io layout and optionally create a request")
  .option("--request <name>", "also create this request folder under Ready to generate")
  .option("--replace", "delete same-named files before uploading", false)
  .option("--from <dir>", "seed from this store instead of the fixture, e.g. .prototype/local-demo after build-demo")
  .option("--prune", "move Frame.io items that are not in the source store into 99 Archive instead of leaving them", false)
  .action(async (options: { request?: string; replace: boolean; from?: string; prune: boolean }) => {
    const config = await loadConfig({ overrides: overrides() });
    const summary = await seedFrameio(config, log, { requestName: options.request, replace: options.replace, from: options.from, prune: options.prune });
    log.info(`uploaded ${summary.uploaded} file(s), skipped ${summary.skipped} existing, replaced ${summary.replaced}, archived ${summary.archived}`);
    if (summary.requestFolderId) {
      log.info(`request ${options.request} is waiting in Ready to generate (${summary.requestFolderId})`);
    }
  });

program
  .command("ping-panel")
  .description("Check that the InDesign panel is running the current build")
  .action(async () => {
    const config = await loadConfig({ overrides: overrides() });
    await pingPanel(config, log);
  });

program
  .command("build-demo")
  .description("Ask the running InDesign panel to build the content library and the layout-driven templates into the local store")
  .action(async () => {
    const config = await loadConfig({ overrides: { ...overrides(), STORAGE_MODE: "local", COMPOSITION_MODE: "uxp" } });
    await pingPanel(config, log);
    const result = await buildDemo(config, log);
    for (const note of result.notes) {
      log.info(`  ${note}`);
    }
    log.info(`built ${result.outputs.length} file(s) into ${config.localStorageRoot}`);
  });

program
  .command("create-samples")
  .description("Ask the running InDesign panel to build the synthetic content library and templates into the local store")
  .action(async () => {
    const config = await loadConfig({ overrides: { ...overrides(), STORAGE_MODE: "local", COMPOSITION_MODE: "uxp" } });
    const result = await createSamples(config, log);
    for (const output of result.outputs) {
      log.info(`  created ${output}`);
    }
    for (const note of result.notes ?? []) {
      log.info(`  ${note}`);
    }
    log.info("next: npm run prototype -- --storage local --composition uxp run req-001-initial-build");
  });

program
  .command("request-frameio <name>")
  .description("Create a request folder with request.json under Ready to generate in Frame.io")
  .option("--json <file>", "upload this request.json instead of generating one")
  .option("--raw", "skip validation of --json (stages an invalid request on purpose)", false)
  .option("--documents <ids>", "comma-separated document ids to limit the request")
  .option("--brands <ids>", "comma-separated brand ids to limit the request")
  .action(async (name: string, options: { json?: string; raw: boolean; documents?: string; brands?: string }) => {
    const config = await loadConfig({ overrides: overrides() });
    await requestFrameio(config, log, {
      name,
      jsonFile: options.json,
      raw: options.raw,
      documentIds: options.documents?.split(",").map((id) => id.trim()).filter(Boolean),
      brandIds: options.brands?.split(",").map((id) => id.trim()).filter(Boolean),
    });
  });

program
  .command("list-frameio [path...]")
  .description("Print the Frame.io project tree below a folder path given by names, e.g. \"03 Generated variants\"")
  .option("--depth <n>", "maximum folder depth to descend", "4")
  .action(async (segments: string[], options: { depth: string }) => {
    const config = await loadConfig({ overrides: overrides() });
    const lines = await listFrameio(config, log, segments, Number(options.depth));
    console.log(lines.join("\n"));
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
