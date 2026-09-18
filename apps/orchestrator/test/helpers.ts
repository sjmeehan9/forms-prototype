import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_REQUEST_DEFAULTS } from "../src/adapters/local/orchestration.js";
import { LocalStorageAdapter } from "../src/adapters/local/storage.js";
import type { SourceModel, SourcePackage } from "../src/domain/models.js";
import { parseComponentRegister } from "../src/domain/schemas.js";
import { silentLogger } from "../src/log.js";
import { downloadSourcePackage, loadSourceModel } from "../src/orchestrator/source-package.js";
import { readJson } from "../src/util/fs.js";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const FIXTURE_STORE = path.join(REPO_ROOT, "fixtures", "frameio");

export function tempDir(prefix = "forms-prototype-"): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function loadFixtureModel(): Promise<{ model: SourceModel; pkg: SourcePackage; dir: string }> {
  const dir = await tempDir();
  const storage = new LocalStorageAdapter(FIXTURE_STORE);
  const pkg = await downloadSourcePackage(storage, LOCAL_REQUEST_DEFAULTS, path.join(dir, "source"), silentLogger);
  const register = parseComponentRegister(await readJson(path.join(FIXTURE_STORE, "01 Source content", "component-register.json")));
  const model = await loadSourceModel(pkg, register);
  return { model, pkg, dir };
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
