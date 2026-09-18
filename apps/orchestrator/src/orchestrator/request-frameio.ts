import path from "node:path";
import { BuildRequestSchema, parseWithSchema } from "@prototype/contracts";
import { createTokenProvider } from "../adapters/frameio/auth.js";
import { FrameioClient } from "../adapters/frameio/client.js";
import { loadFrameioLayout } from "../adapters/frameio/layout.js";
import { FrameioStorageAdapter } from "../adapters/frameio/storage.js";
import { requireFrameioCredentials, type AppConfig } from "../config.js";
import type { Logger } from "../log.js";
import { ensureDir, readJson, writeJsonAtomic } from "../util/fs.js";

export type RequestOptions = { name: string; jsonFile?: string; documentIds?: string[]; brandIds?: string[]; raw?: boolean };

/**
 * Create a request folder under `Ready to generate` with a request.json. With `--json` the file is uploaded
 * verbatim (validated unless `--raw`), which is how an invalid request is staged for the failure demonstration.
 */
export async function requestFrameio(config: AppConfig, log: Logger, options: RequestOptions): Promise<string> {
  const layout = await loadFrameioLayout(config.home);
  const client = new FrameioClient(createTokenProvider(requireFrameioCredentials(config), config.home, log));
  const storage = new FrameioStorageAdapter(client, layout.accountId, log);

  let request: unknown;
  if (options.jsonFile) {
    request = await readJson(path.resolve(config.rootDir, options.jsonFile));
    if (!options.raw) {
      parseWithSchema(BuildRequestSchema, request, "request.json");
    }
  } else {
    request = {
      schemaVersion: 1,
      requestId: options.name,
      requestedAt: new Date().toISOString(),
      ...(options.documentIds ? { documentIds: options.documentIds } : {}),
      ...(options.brandIds ? { brandIds: options.brandIds } : {}),
    };
  }
  const localDir = path.join(config.home, "requests", options.name);
  await ensureDir(localDir);
  const localFile = path.join(localDir, "request.json");
  await writeJsonAtomic(localFile, request);

  const folder = await storage.createFolder(layout.folders.states["Ready to generate"], options.name);
  const existing = (await storage.listChildren(folder.id)).find((item) => item.type === "file" && item.name === "request.json");
  if (existing) {
    await client.deleteFile(layout.accountId, existing.id);
  }
  await storage.upload(folder.id, localFile);
  log.info(`request ${options.name} is waiting in Ready to generate (${folder.id})`);
  return folder.id;
}
