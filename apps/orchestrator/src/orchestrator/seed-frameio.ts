import { readdir } from "node:fs/promises";
import path from "node:path";
import { createTokenProvider } from "../adapters/frameio/auth.js";
import { FrameioClient } from "../adapters/frameio/client.js";
import { loadFrameioLayout, saveFrameioLayout, type FrameioLayout } from "../adapters/frameio/layout.js";
import { FrameioStorageAdapter } from "../adapters/frameio/storage.js";
import { LOCAL_FOLDERS } from "../adapters/local/orchestration.js";
import type { StoredItem } from "../adapters/types.js";
import { requireFrameioCredentials, type AppConfig } from "../config.js";
import { PrototypeError } from "../domain/models.js";
import type { Logger } from "../log.js";
import { ensureDir, pathExists, writeJsonAtomic } from "../util/fs.js";

export type SeedOptions = { requestName?: string; replace: boolean; from?: string; prune?: boolean };
export type SeedSummary = { uploaded: number; skipped: number; replaced: number; archived: number; requestFolderId?: string };

/** Generated sidecars and placeholders that must not be uploaded as source. */
const SKIP_FILES = new Set(["component-register.json", ".gitkeep", ".DS_Store"]);

type Seeder = {
  storage: FrameioStorageAdapter;
  client: FrameioClient;
  layout: FrameioLayout;
  log: Logger;
  replace: boolean;
  prune: boolean;
  /** Lazily created `99 Archive/<stamp>` folder that receives items no longer in the source store. */
  archiveFolder: () => Promise<StoredItem>;
  summary: SeedSummary;
};

async function uploadFile(seeder: Seeder, folderId: string, localPath: string, existing: StoredItem[]): Promise<StoredItem> {
  const name = path.basename(localPath);
  const found = existing.find((item) => item.type === "file" && item.name === name);
  if (found && !seeder.replace) {
    seeder.log.info(`  keeping existing ${name}`);
    seeder.summary.skipped += 1;
    return found;
  }
  if (found) {
    await seeder.client.deleteFile(seeder.layout.accountId, found.id);
    seeder.summary.replaced += 1;
  }
  const uploaded = await seeder.storage.upload(folderId, localPath);
  seeder.log.info(`  uploaded ${name}`);
  seeder.summary.uploaded += 1;
  return uploaded;
}

/** Mirror a local directory into a Frame.io folder, creating sub-folders as needed. */
async function uploadTree(seeder: Seeder, localDir: string, folderId: string): Promise<Map<string, StoredItem>> {
  const uploadedByName = new Map<string, StoredItem>();
  const existing = await seeder.storage.listChildren(folderId);
  const entries = (await readdir(localDir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    if (SKIP_FILES.has(entry.name) || entry.name.startsWith(".")) {
      continue;
    }
    const localPath = path.join(localDir, entry.name);
    if (entry.isDirectory()) {
      const child = await seeder.storage.createFolder(folderId, entry.name);
      await uploadTree(seeder, localPath, child.id);
    } else if (entry.isFile()) {
      uploadedByName.set(entry.name, await uploadFile(seeder, folderId, localPath, existing));
    }
  }
  if (seeder.prune) {
    const localNames = new Set(entries.filter((entry) => !SKIP_FILES.has(entry.name) && !entry.name.startsWith(".")).map((entry) => entry.name));
    for (const item of existing.filter((candidate) => !localNames.has(candidate.name))) {
      await seeder.storage.move(item, (await seeder.archiveFolder()).id);
      seeder.log.info(`  archived ${item.name} (not in the source store)`);
      seeder.summary.archived += 1;
    }
  }
  return uploadedByName;
}

/** Upload the synthetic fixture into the bootstrapped layout, record request defaults, optionally queue a request. */
export async function seedFrameio(config: AppConfig, log: Logger, options: SeedOptions): Promise<SeedSummary> {
  const layout = await loadFrameioLayout(config.home);
  const client = new FrameioClient(createTokenProvider(requireFrameioCredentials(config), config.home, log));
  const storage = new FrameioStorageAdapter(client, layout.accountId, log);
  let archive: StoredItem | null = null;
  const archiveFolder = async (): Promise<StoredItem> => {
    if (!archive) {
      const root = await storage.createFolder(layout.rootFolderId, "99 Archive");
      archive = await storage.createFolder(root.id, new Date().toISOString().replace(/[:.]/g, "-"));
    }
    return archive;
  };
  const seeder: Seeder = { storage, client, layout, log, replace: options.replace, prune: options.prune ?? false, archiveFolder, summary: { uploaded: 0, skipped: 0, replaced: 0, archived: 0 } };
  const fixture = options.from ? path.resolve(config.rootDir, options.from) : config.fixtureStore;
  if (!(await pathExists(fixture))) {
    throw new PrototypeError("seed", `source store not found at ${fixture}`);
  }
  log.info(`seeding from ${fixture}`);

  log.info("seeding 01 Source content");
  const sourceFiles = await uploadTree(seeder, path.join(fixture, LOCAL_FOLDERS.sourceContent), layout.folders.sourceContent);
  const templatesRoot = path.join(fixture, LOCAL_FOLDERS.templatesAndAssets);
  for (const [name, folderId] of [
    ["templates", layout.folders.templates],
    ["brands", layout.folders.brands],
    ["assets", layout.folders.assets],
    ["document-manifests", layout.folders.documentManifests],
  ] as const) {
    log.info(`seeding 02 Templates and assets/${name}`);
    await uploadTree(seeder, path.join(templatesRoot, name), folderId);
  }

  if (options.prune) {
    // Clear earlier releases and finished requests so the project shows only the current document set.
    const stale: StoredItem[] = [...(await storage.listChildren(layout.folders.generatedVariants))];
    for (const stateFolderId of Object.values(layout.folders.states)) {
      stale.push(...(await storage.listChildren(stateFolderId)));
    }
    for (const item of stale) {
      await storage.move(item, (await archiveFolder()).id);
      log.info(`  archived ${item.name}`);
      seeder.summary.archived += 1;
    }
  }

  const library = [...sourceFiles.values()].find((item) => /\.indd$/i.test(item.name));
  const data = [...sourceFiles.values()].find((item) => /\.csv$/i.test(item.name));
  if (!library || !data) {
    throw new PrototypeError("seed", "the fixture did not provide a content library (.indd) and product data (.csv)");
  }
  layout.defaults = { ...layout.defaults, contentLibraryFileId: library.id, dataFileId: data.id };
  layout.updatedAt = new Date().toISOString();
  await saveFrameioLayout(config.home, layout);
  log.info(`request defaults now point at ${library.name} (${library.id}) and ${data.name} (${data.id})`);

  if (options.requestName) {
    const readyFolder = layout.folders.states["Ready to generate"];
    const requestFolder = await storage.createFolder(readyFolder, options.requestName);
    const localDir = path.join(config.home, "seed", options.requestName);
    await ensureDir(localDir);
    const requestFile = path.join(localDir, "request.json");
    await writeJsonAtomic(requestFile, { schemaVersion: 1, requestId: options.requestName, requestedAt: new Date().toISOString() });
    const existing = await storage.listChildren(requestFolder.id);
    await uploadFile({ ...seeder, replace: true }, requestFolder.id, requestFile, existing);
    seeder.summary.requestFolderId = requestFolder.id;
  }
  return seeder.summary;
}
