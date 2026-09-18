import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_FOLDERS, localStateFolders } from "../adapters/local/orchestration.js";
import { loadConfig } from "../config.js";
import { PrototypeError } from "../domain/models.js";
import type { Logger } from "../log.js";
import { ensureDir, pathExists, removeDir, writeJsonAtomic } from "../util/fs.js";
import { createContext } from "./context.js";
import { drainRequests } from "./poller.js";
import type { RunOutcome } from "./run-request.js";

export type E2EReport = { runs: RunOutcome[]; storeRoot: string; home: string };

export type E2EOptions = { rootDir: string; fixtureStore: string; home: string; log: Logger };

async function createRequestFolder(storeRoot: string, name: string): Promise<void> {
  const dir = path.join(storeRoot, ...localStateFolders()["Ready to generate"].split("/"), name);
  await ensureDir(dir);
  await writeJsonAtomic(path.join(dir, "request.json"), { schemaVersion: 1, requestId: name, requestedAt: new Date().toISOString() });
}

/**
 * Three requests over a throwaway copy of the fixture store, without Adobe or Frame.io:
 * 1. first run builds every document/brand output;
 * 2. one shared data value changes and only the documents binding it are rebuilt;
 * 3. a manifest with a missing component reference fails visibly.
 */
export async function runFixtureE2E(options: E2EOptions): Promise<E2EReport> {
  const { home, log } = options;
  await removeDir(home);
  await ensureDir(home);
  const storeRoot = path.join(home, "local-frameio");
  const config = await loadConfig({
    rootDir: options.rootDir,
    overrides: { STORAGE_MODE: "local", COMPOSITION_MODE: "dry-run", PROTOTYPE_HOME: home, LOCAL_STORAGE_ROOT: storeRoot, FIXTURE_STORE: options.fixtureStore },
  });
  const ctx = await createContext(config, log, { resetLocalStore: true });
  const runs: RunOutcome[] = [];

  log.info("E2E run 1: initial build of every output");
  runs.push(...(await drainRequests(ctx)));

  log.info("E2E run 2: change contact.phone in product-data.csv and request again");
  const csvPath = path.join(storeRoot, LOCAL_FOLDERS.sourceContent, "product-data.csv");
  const csv = await readFile(csvPath, "utf8");
  if (!csv.includes("1300 000 000")) {
    throw new PrototypeError("e2e", "fixture product-data.csv does not contain the expected contact.phone value");
  }
  await writeFile(csvPath, csv.replace("1300 000 000", "1300 111 222"), "utf8");
  await createRequestFolder(storeRoot, "req-002-phone-update");
  runs.push(...(await drainRequests(ctx)));

  log.info("E2E run 3: break a manifest with a missing component reference");
  const manifestPath = path.join(storeRoot, LOCAL_FOLDERS.templatesAndAssets, "document-manifests", "benefits-flyer.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { bindings: unknown[] };
  manifest.bindings.push({ target: "content:missing.clause", source: { type: "component", id: "missing.clause" } });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await createRequestFolder(storeRoot, "req-003-broken-manifest");
  runs.push(...(await drainRequests(ctx)));

  return { runs, storeRoot, home };
}

/** The acceptance expectations for the fixture; throws with every unmet expectation. */
export async function assertExpectedE2E(report: E2EReport): Promise<void> {
  const problems: string[] = [];
  const [first, second, third] = report.runs;
  if (report.runs.length !== 3) {
    problems.push(`expected 3 runs, got ${report.runs.length}`);
  }
  if (!first || first.status !== "completed" || first.rebuilt.length !== 6 || first.skipped.length !== 0) {
    problems.push(`run 1 should complete with 6 rebuilt outputs (got ${first?.status}, rebuilt ${first?.rebuilt.length}, skipped ${first?.skipped.length})`);
  }
  if (!second || second.status !== "completed" || second.rebuilt.length !== 4 || second.skipped.length !== 2) {
    problems.push(`run 2 should complete with 4 rebuilt and 2 skipped outputs (got ${second?.status}, rebuilt ${second?.rebuilt.length}, skipped ${second?.skipped.length})`);
  }
  if (second && second.skipped.some((target) => target.documentId !== "member-guide")) {
    problems.push("run 2 should only skip the member-guide outputs");
  }
  if (!third || third.status !== "failed" || third.stage !== "validate") {
    problems.push(`run 3 should fail during validate (got ${third?.status} in ${third?.stage})`);
  }
  const states = localStateFolders();
  const expectedFolders = [
    path.join(report.storeRoot, ...states["Ready for review"].split("/"), "req-001-initial-build"),
    path.join(report.storeRoot, ...states["Ready for review"].split("/"), "req-002-phone-update"),
    path.join(report.storeRoot, ...states.Failed.split("/"), "req-003-broken-manifest", "failure.json"),
  ];
  for (const folder of expectedFolders) {
    if (!(await pathExists(folder))) {
      problems.push(`expected ${folder} to exist`);
    }
  }
  if (first?.releaseId) {
    const release = path.join(report.storeRoot, LOCAL_FOLDERS.generatedVariants, first.releaseId, "release-manifest.json");
    if (!(await pathExists(release))) {
      problems.push(`expected release manifest at ${release}`);
    }
  }
  if (problems.length > 0) {
    throw new PrototypeError("e2e", "fixture end-to-end expectations were not met", problems);
  }
}
