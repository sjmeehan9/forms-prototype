import path from "node:path";
import {
  BuildRequestSchema,
  BuildRequestSourceSchema,
  parseWithSchema,
  type BuildRequest,
  type BuildRequestSource,
  type ComponentRegister,
  type OutputKind,
  type ReleaseFile,
  type ReleaseManifest,
  type ReleaseOutput,
  type TargetChecks,
  type UxpJob,
  type UxpResult,
} from "@prototype/contracts";
import type { BuildRequestRef, StoredItem } from "../adapters/types.js";
import { computeSnapshot, diffSnapshots, snapshotHash } from "../domain/change-detector.js";
import { buildDependencyGraph, selectAffectedTargets, type AffectedTarget } from "../domain/dependency-graph.js";
import {
  PrototypeError,
  errorDetails,
  errorMessage,
  errorStage,
  sameTarget,
  targetKey,
  type OutputTarget,
  type SourceModel,
  type SourcePackage,
} from "../domain/models.js";
import { createFailureRecord, createReleaseId, createReleaseManifest, renderReleaseReport } from "../domain/release.js";
import { resolveBundle } from "../domain/resolver.js";
import { parseComponentRegister } from "../domain/schemas.js";
import { ensureDir, fileSize, pathExists, readJson, removeDir, sha256File, toPosix, writeJsonAtomic, writeTextAtomic } from "../util/fs.js";
import { APPLICATION_VERSION } from "../version.js";
import type { RunContext } from "./context.js";
import { downloadSourcePackage, loadSourceModel } from "./source-package.js";

export type RunOutcome = {
  requestId: string;
  requestFolder: string;
  status: "completed" | "failed";
  stage?: string;
  error?: string;
  details: string[];
  releaseId?: string;
  rebuilt: OutputTarget[];
  skipped: OutputTarget[];
  outputs: string[];
  workDir: string;
};

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "request";
}

/** Job paths are relative to the prototype home because the UXP panel can only reach files inside it. */
export function toJobPath(ctx: RunContext, absolutePath: string): string {
  const relative = path.relative(ctx.config.home, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PrototypeError("compose", `${absolutePath} is outside the prototype home ${ctx.config.home}; InDesign can only access files inside it`);
  }
  return toPosix(relative);
}

export function fromJobPath(ctx: RunContext, jobPath: string): string {
  return path.join(ctx.config.home, ...jobPath.split("/"));
}

async function readBuildRequest(ctx: RunContext, ref: BuildRequestRef, workDir: string): Promise<BuildRequest> {
  const children = await ctx.storage.listChildren(ref.folder.id);
  const requestFile = children.find((item) => item.type === "file" && item.name === "request.json");
  if (!requestFile) {
    ctx.log.info(`[${ref.folder.name}] no request.json in the request folder; using the configured source defaults`);
    return { schemaVersion: 1, requestId: ref.folder.name, requestedAt: ctx.now().toISOString() };
  }
  const destination = path.join(workDir, "request.json");
  await ctx.storage.download(requestFile.id, destination);
  return parseWithSchema(BuildRequestSchema, await readJson(destination), "request.json");
}

async function mergeSource(ctx: RunContext, defaults: Partial<BuildRequestSource>, fromRequest: Partial<BuildRequestSource> | undefined): Promise<BuildRequestSource> {
  const merged: Partial<BuildRequestSource> = { ...defaults, ...(fromRequest ?? {}) };
  if (merged.sourceContentFolderId) {
    // A re-uploaded library or data file has a new id, so follow the newest matching file instead of a stored id.
    const files = (await ctx.storage.listChildren(merged.sourceContentFolderId)).filter((item) => item.type === "file");
    const newest = (pattern: RegExp): string | undefined =>
      files.filter((item) => pattern.test(item.name)).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.name.localeCompare(b.name))[0]?.id;
    if (!fromRequest?.contentLibraryFileId) {
      merged.contentLibraryFileId = newest(/\.indd$/i) ?? merged.contentLibraryFileId;
    }
    if (!fromRequest?.dataFileId) {
      merged.dataFileId = newest(/\.csv$/i) ?? merged.dataFileId;
    }
  }
  const result = BuildRequestSourceSchema.safeParse(merged);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.map(String).join("."));
    throw new PrototypeError("request", `request is missing source ids: ${missing.join(", ")}; upload the source files and re-run bootstrap, or add the ids to request.json`);
  }
  return result.data;
}

async function recordResult(workDir: string, result: UxpResult): Promise<void> {
  await writeJsonAtomic(path.join(workDir, "results", `${result.jobId}.json`), result);
}

async function extractComponents(ctx: RunContext, pkg: SourcePackage, workDir: string, jobPrefix: string): Promise<ComponentRegister> {
  const outputJson = path.join(workDir, "extracted", "component-register.json");
  await ensureDir(path.dirname(outputJson));
  const job: UxpJob = {
    schemaVersion: 1,
    jobId: `${jobPrefix}--extract`,
    type: "extract-content",
    inputIndd: toJobPath(ctx, pkg.contentLibrary.absolutePath),
    outputJson: toJobPath(ctx, outputJson),
  };
  ctx.log.info(`[${jobPrefix}] extracting reusable content from ${pkg.contentLibrary.name} (job ${job.jobId})`);
  await ctx.composition.submit(job);
  const result = await ctx.composition.wait(job.jobId);
  await recordResult(workDir, result);
  if (result.status !== "completed") {
    throw new PrototypeError("extract", `content extraction failed: ${result.error ?? "no error detail from InDesign"}`, result.notes ?? []);
  }
  const register = parseComponentRegister(await readJson(outputJson));
  return { ...register, sourceHash: pkg.contentLibrary.sha256 };
}

function outputKind(fileName: string): OutputKind {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith("-interactive.pdf")) {
    return "interactive-pdf";
  }
  if (lowered.endsWith(".pdf")) {
    return "print-pdf";
  }
  if (lowered.endsWith(".indd")) {
    return "indd";
  }
  throw new PrototypeError("compose", `unrecognised output file ${fileName}`);
}

function checkProblems(result: UxpResult): string[] {
  const problems: string[] = [];
  if (result.status !== "completed") {
    problems.push(`InDesign reported failure: ${result.error ?? "no error detail"}`);
  }
  if (result.checks.overset) {
    problems.push("overset text");
  }
  problems.push(...result.checks.missingLinks.map((link) => `missing or outdated link: ${link}`));
  problems.push(...result.checks.missingFonts.map((font) => `missing font: ${font}`));
  problems.push(...result.checks.preflightErrors.map((error) => `preflight: ${error}`));
  return problems;
}

type ComposedTarget = { outputs: ReleaseOutput[]; localPaths: Map<string, string>; checks: TargetChecks; bundlePath: string };

async function composeTarget(ctx: RunContext, model: SourceModel, target: OutputTarget, workDir: string, jobPrefix: string, started: Date): Promise<ComposedTarget> {
  const manifest = model.manifests.find((m) => m.id === target.documentId);
  const brand = model.brands.find((b) => b.id === target.brandId);
  if (!manifest || !brand) {
    throw new PrototypeError("compose", `target ${targetKey(target)} has no manifest or brand pack`);
  }
  const bundle = resolveBundle({ manifest, brand, model, today: started.toISOString().slice(0, 10), toJobPath: (p) => toJobPath(ctx, p) });
  const bundlePath = path.join(workDir, "bundles", `${bundle.outputBaseName}.json`);
  await writeJsonAtomic(bundlePath, bundle);
  const outputDir = path.join(workDir, "outputs", brand.id);
  await ensureDir(outputDir);
  const job: UxpJob = {
    schemaVersion: 1,
    jobId: `${jobPrefix}--${bundle.outputBaseName}`,
    type: "compose-document",
    template: bundle.template,
    bundle: toJobPath(ctx, bundlePath),
    outputDir: toJobPath(ctx, outputDir),
  };
  ctx.log.info(`[${jobPrefix}] composing ${bundle.outputBaseName} (job ${job.jobId})`);
  await ctx.composition.submit(job);
  const result = await ctx.composition.wait(job.jobId);
  await recordResult(workDir, result);
  const checks: TargetChecks = { ...result.checks, documentId: target.documentId, brandId: target.brandId };
  const problems = checkProblems(result);
  if (problems.length > 0) {
    throw new PrototypeError("compose", `composition of ${bundle.outputBaseName} failed`, problems);
  }

  const outputs: ReleaseOutput[] = [];
  const localPaths = new Map<string, string>();
  for (const jobPath of result.outputs) {
    const absolutePath = fromJobPath(ctx, jobPath);
    if (!(await pathExists(absolutePath))) {
      throw new PrototypeError("compose", `InDesign reported an output that does not exist: ${jobPath}`);
    }
    const releasePath = `${brand.id}/${path.basename(absolutePath)}`;
    outputs.push({ documentId: target.documentId, brandId: target.brandId, kind: outputKind(absolutePath), path: releasePath, sha256: await sha256File(absolutePath), size: await fileSize(absolutePath) });
    localPaths.set(releasePath, absolutePath);
  }
  const expected: [boolean, OutputKind][] = [[bundle.output.saveIndd, "indd"], [bundle.output.printPdf, "print-pdf"], [bundle.output.interactivePdf, "interactive-pdf"]];
  const missing = expected.filter(([wanted, kind]) => wanted && !outputs.some((o) => o.kind === kind)).map(([, kind]) => kind);
  if (missing.length > 0) {
    throw new PrototypeError("compose", `composition of ${bundle.outputBaseName} did not produce: ${missing.join(", ")}`);
  }
  const bundleReleasePath = `evidence/bundles/${path.basename(bundlePath)}`;
  outputs.push({ documentId: target.documentId, brandId: target.brandId, kind: "bundle", path: bundleReleasePath, sha256: await sha256File(bundlePath), size: await fileSize(bundlePath) });
  localPaths.set(bundleReleasePath, bundlePath);
  return { outputs, localPaths, checks, bundlePath };
}

function sourceFilesOf(pkg: SourcePackage): ReleaseFile[] {
  const files = [pkg.contentLibrary, pkg.data, ...pkg.manifests, ...pkg.templates, ...pkg.brands, ...pkg.assets];
  return files
    .map((file) => ({ path: file.relativePath, sha256: file.sha256, size: file.size, storageId: file.storageId, version: file.version }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Upload every output into `<generated variants>/<releaseId>/<brand>/` and evidence into `evidence/`; fills storage ids. */
async function uploadOutputs(ctx: RunContext, releaseFolder: StoredItem, outputs: ReleaseOutput[], localPaths: Map<string, string>): Promise<void> {
  const folders = new Map<string, StoredItem>();
  const folderFor = async (relativeDir: string): Promise<StoredItem> => {
    const cached = folders.get(relativeDir);
    if (cached) {
      return cached;
    }
    let current = releaseFolder;
    for (const segment of relativeDir.split("/")) {
      current = await ctx.storage.createFolder(current.id, segment);
    }
    folders.set(relativeDir, current);
    return current;
  };
  for (const output of outputs) {
    const localPath = localPaths.get(output.path);
    if (!localPath) {
      throw new PrototypeError("release", `no local file recorded for ${output.path}`);
    }
    const folder = await folderFor(path.posix.dirname(output.path));
    const uploaded = await ctx.storage.upload(folder.id, localPath);
    output.storageId = uploaded.id;
  }
}

export async function runRequest(ctx: RunContext, ref: BuildRequestRef): Promise<RunOutcome> {
  const requestFolder = ref.folder.name;
  const requestSlug = slug(requestFolder);
  const workDir = path.join(ctx.config.home, "work", requestSlug);
  const { log } = ctx;
  const started = ctx.now();
  /** Job ids must be unique per run so a re-run of the same request never reads a stale queue result. */
  const jobPrefix = `${requestSlug}--${started.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  let stage = "claim";
  let requestId = requestFolder;

  log.info(`[${requestFolder}] claiming request`);
  ctx.state.markProcessed(ref.folder.id);
  await ctx.orchestration.claim(ref);
  await ctx.state.save();

  try {
    await removeDir(workDir);
    await ensureDir(workDir);

    stage = "request";
    const request = await readBuildRequest(ctx, ref, workDir);
    requestId = request.requestId;
    const source = await mergeSource(ctx, ctx.layout.requestDefaults, request.source);

    stage = "download";
    const pkg = await downloadSourcePackage(ctx.storage, source, path.join(workDir, "source"), log);

    stage = "extract";
    const register = await extractComponents(ctx, pkg, workDir, jobPrefix);

    stage = "validate";
    const model = await loadSourceModel(pkg, register);

    stage = "select";
    const snapshot = computeSnapshot(model, started.toISOString());
    const diff = diffSnapshots(ctx.state.lastSuccessfulSnapshot, snapshot);
    const graph = buildDependencyGraph(model);
    const affected: AffectedTarget[] = diff.firstRun
      ? graph.targets.map((entry) => ({ target: entry.target, reasons: ["first run"] }))
      : selectAffectedTargets(graph, diff.changed);
    const selected = affected.filter(
      (entry) =>
        (!request.documentIds || request.documentIds.includes(entry.target.documentId)) &&
        (!request.brandIds || request.brandIds.includes(entry.target.brandId)),
    );
    const selectedKeys = new Set(selected.map((entry) => targetKey(entry.target)));
    const outputSelection = graph.targets.map((entry) => {
      const hit = selected.find((candidate) => sameTarget(candidate.target, entry.target));
      return { documentId: entry.target.documentId, brandId: entry.target.brandId, rebuilt: hit !== undefined, reasons: hit?.reasons ?? [] };
    });
    log.info(`[${requestFolder}] ${diff.firstRun ? "first run" : `${diff.changed.length} changed input(s)`}; rebuilding ${selected.length} of ${graph.targets.length} output(s)`);

    stage = "compose";
    const outputs: ReleaseOutput[] = [];
    const localPaths = new Map<string, string>();
    const checks: TargetChecks[] = [];
    for (const entry of selected) {
      const composed = await composeTarget(ctx, model, entry.target, workDir, jobPrefix, started);
      outputs.push(...composed.outputs);
      checks.push(composed.checks);
      for (const [releasePath, localPath] of composed.localPaths) {
        localPaths.set(releasePath, localPath);
      }
    }

    stage = "release";
    const releaseId = createReleaseId(started, `${requestFolder}:${snapshotHash(snapshot)}`);
    const releaseDir = path.join(workDir, "release");
    await ensureDir(releaseDir);
    const releaseFolder = await ctx.storage.createFolder(ctx.layout.generatedVariantsFolderId, releaseId);
    log.info(`[${requestFolder}] uploading ${outputs.length} file(s) to release ${releaseId}`);
    await uploadOutputs(ctx, releaseFolder, outputs, localPaths);

    const manifest: ReleaseManifest = createReleaseManifest({
      releaseId,
      requestId,
      requestFolder,
      createdAt: started.toISOString(),
      applicationVersion: APPLICATION_VERSION,
      storageMode: ctx.config.storageMode,
      compositionMode: ctx.config.compositionMode,
      sourceFiles: sourceFilesOf(pkg),
      inputs: snapshot.inputs,
      changedInputs: diff.firstRun ? [] : diff.changed,
      firstRun: diff.firstRun,
      outputSelection,
      outputs,
      checks,
      validation: { status: "passed", errors: [] },
      status: "completed",
    });
    const manifestPath = path.join(releaseDir, "release-manifest.json");
    const reportPath = path.join(releaseDir, "release-report.md");
    const registerPath = path.join(releaseDir, "component-register.json");
    await writeJsonAtomic(manifestPath, manifest);
    await writeTextAtomic(reportPath, renderReleaseReport(manifest));
    await writeJsonAtomic(registerPath, register);
    const evidenceFolder = await ctx.storage.createFolder(releaseFolder.id, "evidence");
    await ctx.storage.upload(evidenceFolder.id, registerPath);
    for (const file of [manifestPath, reportPath]) {
      await ctx.storage.upload(releaseFolder.id, file);
      await ctx.storage.upload(ref.folder.id, file);
    }

    ctx.state.setSuccessfulSnapshot(snapshot, releaseId);
    await ctx.state.save();
    await ctx.orchestration.setState(ref, "Ready for review");
    log.info(`[${requestFolder}] ready for review as ${releaseId}`);
    return {
      requestId,
      requestFolder,
      status: "completed",
      releaseId,
      rebuilt: selected.map((entry) => entry.target),
      skipped: graph.targets.map((entry) => entry.target).filter((target) => !selectedKeys.has(targetKey(target))),
      outputs: outputs.map((output) => output.path),
      details: [],
      workDir,
    };
  } catch (error) {
    const failedStage = errorStage(error, stage);
    const message = errorMessage(error);
    const details = errorDetails(error);
    log.error(`[${requestFolder}] failed during ${failedStage}: ${message}`);
    for (const detail of details) {
      log.error(`  - ${detail}`);
    }
    const failure = createFailureRecord({ requestId, requestFolder, failedAt: ctx.now().toISOString(), stage: failedStage, message, details });
    const failurePath = path.join(workDir, "failure.json");
    try {
      await writeJsonAtomic(failurePath, failure);
      await ctx.storage.upload(ref.folder.id, failurePath);
    } catch (uploadError) {
      log.warn(`[${requestFolder}] could not upload failure.json: ${errorMessage(uploadError)}`);
    }
    try {
      await ctx.orchestration.setState(ref, "Failed");
    } catch (stateError) {
      log.warn(`[${requestFolder}] could not move the request to Failed: ${errorMessage(stateError)}`);
    }
    await ctx.state.save();
    return { requestId, requestFolder, status: "failed", stage: failedStage, error: message, details, rebuilt: [], skipped: [], outputs: [], workDir };
  }
}
