import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createTokenProvider } from "../adapters/frameio/auth.js";
import { FrameioClient } from "../adapters/frameio/client.js";
import { loadFrameioLayout, saveFrameioLayout } from "../adapters/frameio/layout.js";
import { FrameioStorageAdapter } from "../adapters/frameio/storage.js";
import { requireFrameioCredentials, type AppConfig } from "../config.js";
import { PrototypeError, errorMessage } from "../domain/models.js";
import type { Logger } from "../log.js";
import { ensureDir, writeJsonAtomic } from "../util/fs.js";
import { sleep } from "./poller.js";

export type ProbeResult = Record<string, unknown>;

async function attempt(name: string, results: ProbeResult, log: Logger, action: () => Promise<unknown>): Promise<void> {
  try {
    const value = await action();
    results[name] = value === undefined ? "ok" : value;
    log.info(`${name}: ok`);
  } catch (error) {
    results[name] = `unavailable: ${errorMessage(error)}`;
    log.warn(`${name}: ${errorMessage(error)}`);
  }
}

/** Prove upload, list, original download with hash comparison, and file/folder moves; record optional features. */
export async function probeFrameio(config: AppConfig, log: Logger, options: { keep: boolean }): Promise<ProbeResult> {
  const layout = await loadFrameioLayout(config.home);
  const client = new FrameioClient(createTokenProvider(requireFrameioCredentials(config), config.home, log));
  const storage = new FrameioStorageAdapter(client, layout.accountId, log);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const results: ProbeResult = { probedAt: new Date().toISOString() };
  const probeDir = path.join(config.home, "probe");
  await ensureDir(probeDir);

  const probeFolder = await storage.createFolder(layout.rootFolderId, `zz-probe-${stamp}`);
  results.probeFolderId = probeFolder.id;
  const localFile = path.join(probeDir, `probe-${stamp}.txt`);
  await writeFile(localFile, `Synthetic Frame.io transfer probe ${stamp}\n${randomBytes(2048).toString("hex")}\n`, "utf8");

  const uploaded = await storage.upload(probeFolder.id, localFile);
  results.upload = { fileId: uploaded.id, size: uploaded.fileSize, sha256: uploaded.sha256 };
  log.info(`uploaded ${uploaded.name} as ${uploaded.id}`);

  const listed = await storage.listChildren(probeFolder.id);
  results.listShowsUpload = listed.some((item) => item.id === uploaded.id);

  let downloadedHash: string | undefined;
  for (let attemptNumber = 1; attemptNumber <= 12; attemptNumber += 1) {
    try {
      const downloaded = await storage.download(uploaded.id, path.join(probeDir, `download-${stamp}.txt`));
      downloadedHash = downloaded.sha256;
      break;
    } catch (error) {
      if (!(error instanceof PrototypeError) || attemptNumber === 12) {
        throw error;
      }
      log.info(`original download link not ready yet (${errorMessage(error)}); retrying in 5 s`);
      await sleep(5000);
    }
  }
  results.roundTripHashMatches = downloadedHash === uploaded.sha256;
  if (!results.roundTripHashMatches) {
    throw new PrototypeError("probe", `downloaded hash ${downloadedHash} does not match uploaded hash ${uploaded.sha256}`);
  }
  log.info("download hash matches the upload");

  const movedFolder = await storage.createFolder(probeFolder.id, "moved");
  await storage.move(uploaded, movedFolder.id);
  results.fileMoveWorks = (await storage.listChildren(movedFolder.id)).some((item) => item.id === uploaded.id);
  const requestSim = await storage.createFolder(probeFolder.id, "request-sim");
  await storage.move(requestSim, movedFolder.id);
  results.folderMoveWorks = (await storage.listChildren(movedFolder.id)).some((item) => item.id === requestSim.id);
  log.info(`file move ${results.fileMoveWorks ? "works" : "FAILED"}, folder move ${results.folderMoveWorks ? "works" : "FAILED"}`);

  const optional: ProbeResult = {};
  await attempt("fieldDefinitions", optional, log, async () => (await client.fieldDefinitions(layout.accountId)).map((d) => `${d.name} (${d.field_type})`));
  await attempt("fileMetadata", optional, log, () => client.fileMetadata(layout.accountId, uploaded.id));
  await attempt("versionStacks", optional, log, async () => (await client.versionStacks(layout.accountId, probeFolder.id)).length);
  await attempt("comments", optional, log, () => client.createComment(layout.accountId, uploaded.id, "Prototype probe comment (synthetic)"));
  results.optional = optional;
  results.humanChecks = [
    "Mounted Storage: open the project in Frame.io Drive and confirm the probe file is visible",
    "Multi-page INDD preview: upload a synthetic .indd and open it in the Frame.io viewer",
  ];

  if (!options.keep) {
    try {
      await client.deleteFolder(layout.accountId, probeFolder.id);
      results.cleanedUp = true;
    } catch (error) {
      results.cleanedUp = `failed: ${errorMessage(error)}`;
      log.warn(`could not delete the probe folder: ${errorMessage(error)}`);
    }
  }

  layout.capabilities = { ...layout.capabilities, probe: results };
  layout.updatedAt = new Date().toISOString();
  await saveFrameioLayout(config.home, layout);
  await writeJsonAtomic(path.join(config.home, "capabilities.json"), results);
  return results;
}
