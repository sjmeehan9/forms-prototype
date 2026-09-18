import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BuildRequestSource, ComponentRegister } from "@prototype/contracts";
import { PrototypeError, type SourceFile, type SourceModel, type SourcePackage } from "../domain/models.js";
import { parseBrandPack, parseDocumentManifest, parseProductData, validateSourceModel } from "../domain/schemas.js";
import type { StorageAdapter, StoredFile } from "../adapters/types.js";
import type { Logger } from "../log.js";
import { ensureDir, fileSize, listFilesRecursive, readJson, sha256File } from "../util/fs.js";

/** Sub-folders of a downloaded source package. Asset and brand paths keep these prefixes for resolution. */
export const SOURCE_DIRS = {
  contentLibrary: "content-library",
  data: "data",
  manifests: "document-manifests",
  templates: "templates",
  brands: "brands",
  assets: "assets",
} as const;

export const BRAND_PACK_FILE = "brand.json";

type StorageInfo = { storageId: string; version?: string };

async function downloadFile(storage: StorageAdapter, fileId: string, dir: string, info: Map<string, StorageInfo>, prefix: string): Promise<StoredFile> {
  const item = await storage.stat(fileId);
  if (item.type !== "file") {
    throw new PrototypeError("download", `${fileId} is a folder; a file was expected`);
  }
  const file = await storage.download(fileId, path.join(dir, item.name));
  info.set(`${prefix}/${item.name}`, { storageId: file.id, version: file.version });
  return file;
}

async function downloadFolder(storage: StorageAdapter, folderId: string, dir: string, info: Map<string, StorageInfo>, prefix: string): Promise<void> {
  await ensureDir(dir);
  for (const child of await storage.listChildren(folderId)) {
    if (child.type === "folder") {
      await downloadFolder(storage, child.id, path.join(dir, child.name), info, `${prefix}/${child.name}`);
    } else {
      const file = await storage.download(child.id, path.join(dir, child.name));
      info.set(`${prefix}/${child.name}`, { storageId: file.id, version: file.version });
    }
  }
}

/** Transfer the request's source files into `destDir` using the fixed sub-folder layout. */
export async function downloadSourcePackage(storage: StorageAdapter, source: BuildRequestSource, destDir: string, log: Logger): Promise<SourcePackage> {
  await ensureDir(destDir);
  const info = new Map<string, StorageInfo>();
  await downloadFile(storage, source.contentLibraryFileId, path.join(destDir, SOURCE_DIRS.contentLibrary), info, SOURCE_DIRS.contentLibrary);
  await downloadFile(storage, source.dataFileId, path.join(destDir, SOURCE_DIRS.data), info, SOURCE_DIRS.data);
  await downloadFolder(storage, source.manifestFolderId, path.join(destDir, SOURCE_DIRS.manifests), info, SOURCE_DIRS.manifests);
  await downloadFolder(storage, source.templateFolderId, path.join(destDir, SOURCE_DIRS.templates), info, SOURCE_DIRS.templates);
  await downloadFolder(storage, source.brandFolderId, path.join(destDir, SOURCE_DIRS.brands), info, SOURCE_DIRS.brands);
  await downloadFolder(storage, source.assetFolderId, path.join(destDir, SOURCE_DIRS.assets), info, SOURCE_DIRS.assets);
  log.info(`downloaded ${info.size} source file(s) to ${destDir}`);
  return collectSourcePackage(destDir, info);
}

/** Describe an already-downloaded source package directory. */
export async function collectSourcePackage(sourceDir: string, storageInfo: Map<string, StorageInfo> = new Map()): Promise<SourcePackage> {
  const files = await listFilesRecursive(sourceDir);
  const describe = async (relativePath: string): Promise<SourceFile> => {
    const absolutePath = path.join(sourceDir, ...relativePath.split("/"));
    const extra = storageInfo.get(relativePath);
    return {
      relativePath,
      absolutePath,
      name: path.posix.basename(relativePath),
      sha256: await sha256File(absolutePath),
      size: await fileSize(absolutePath),
      ...(extra ? { storageId: extra.storageId, version: extra.version } : {}),
    };
  };
  const under = (dir: string): string[] => files.filter((file) => file.startsWith(`${dir}/`));
  const single = async (dir: string, label: string): Promise<SourceFile> => {
    const candidates = under(dir);
    const [only] = candidates;
    if (!only || candidates.length !== 1) {
      throw new PrototypeError("download", `expected exactly one ${label} under ${dir}/, found ${candidates.length}`);
    }
    return describe(only);
  };
  return {
    rootDir: sourceDir,
    contentLibrary: await single(SOURCE_DIRS.contentLibrary, "content library"),
    data: await single(SOURCE_DIRS.data, "product data file"),
    manifests: await Promise.all(under(SOURCE_DIRS.manifests).filter((f) => f.endsWith(".json")).map(describe)),
    templates: await Promise.all(under(SOURCE_DIRS.templates).map(describe)),
    brands: await Promise.all(under(SOURCE_DIRS.brands).map(describe)),
    assets: await Promise.all(under(SOURCE_DIRS.assets).map(describe)),
  };
}

/** Parse and validate every governed input of the package into one in-memory model. */
export async function loadSourceModel(pkg: SourcePackage, register: ComponentRegister): Promise<SourceModel> {
  const data = parseProductData(await readFile(pkg.data.absolutePath, "utf8"), pkg.data.sha256);
  const manifests = [];
  for (const file of pkg.manifests) {
    manifests.push(parseDocumentManifest(await readJson(file.absolutePath), `document manifest ${file.name}`));
  }
  const brands = [];
  for (const file of pkg.brands.filter((f) => f.name === BRAND_PACK_FILE)) {
    brands.push(parseBrandPack(await readJson(file.absolutePath), `brand pack ${file.relativePath}`));
  }
  const model: SourceModel = {
    register,
    data,
    manifests,
    brands,
    templates: pkg.templates,
    assets: [...pkg.brands.filter((f) => f.name !== BRAND_PACK_FILE), ...pkg.assets],
  };
  validateSourceModel(model);
  return model;
}
