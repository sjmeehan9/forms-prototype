import path from "node:path";
import type { BuildRequestSource } from "@prototype/contracts";
import { DryRunCompositionAdapter } from "../adapters/composition/dry-run.js";
import { FireflyCompositionStub } from "../adapters/composition/firefly-stub.js";
import { LocalQueueCompositionAdapter } from "../adapters/composition/local-queue.js";
import { createTokenProvider } from "../adapters/frameio/auth.js";
import { FrameioClient } from "../adapters/frameio/client.js";
import { loadFrameioLayout } from "../adapters/frameio/layout.js";
import { FrameioOrchestrationAdapter } from "../adapters/frameio/orchestration.js";
import { FrameioStorageAdapter } from "../adapters/frameio/storage.js";
import { LOCAL_FOLDERS, LOCAL_REQUEST_DEFAULTS, LocalOrchestrationAdapter, ensureLocalStore } from "../adapters/local/orchestration.js";
import { LocalStorageAdapter } from "../adapters/local/storage.js";
import type { CompositionAdapter, OrchestrationAdapter, StorageAdapter } from "../adapters/types.js";
import { requireFrameioCredentials, type AppConfig } from "../config.js";
import type { Logger } from "../log.js";
import { ensureDir } from "../util/fs.js";
import { StateStore } from "./state.js";

export type RunContext = {
  config: AppConfig;
  storage: StorageAdapter;
  orchestration: OrchestrationAdapter;
  composition: CompositionAdapter;
  state: StateStore;
  log: Logger;
  layout: { generatedVariantsFolderId: string; requestDefaults: Partial<BuildRequestSource> };
  now: () => Date;
};

export type ContextOptions = { now?: () => Date; resetLocalStore?: boolean };

/** Wire adapters for the configured storage and composition modes. */
export async function createContext(config: AppConfig, log: Logger, options: ContextOptions = {}): Promise<RunContext> {
  await ensureDir(config.home);
  const state = new StateStore(path.join(config.home, "state.json"));
  await state.load();
  const isProcessed = (folderId: string): boolean => state.isProcessed(folderId);

  let storage: StorageAdapter;
  let orchestration: OrchestrationAdapter;
  let layout: RunContext["layout"];
  if (config.storageMode === "local") {
    await ensureLocalStore(config.localStorageRoot, config.fixtureStore, { reset: options.resetLocalStore ?? false });
    const local = new LocalStorageAdapter(config.localStorageRoot);
    storage = local;
    orchestration = new LocalOrchestrationAdapter(local, isProcessed);
    layout = { generatedVariantsFolderId: LOCAL_FOLDERS.generatedVariants, requestDefaults: LOCAL_REQUEST_DEFAULTS };
  } else {
    const credentials = requireFrameioCredentials(config);
    const frameioLayout = await loadFrameioLayout(config.home);
    const client = new FrameioClient(createTokenProvider(credentials, config.home, log));
    storage = new FrameioStorageAdapter(client, frameioLayout.accountId, log);
    orchestration = new FrameioOrchestrationAdapter(storage, frameioLayout, isProcessed);
    layout = { generatedVariantsFolderId: frameioLayout.folders.generatedVariants, requestDefaults: frameioLayout.defaults };
  }

  let composition: CompositionAdapter;
  if (config.compositionMode === "uxp") {
    composition = new LocalQueueCompositionAdapter(config.home, config.uxpJobTimeoutMs);
  } else if (config.compositionMode === "dry-run") {
    const registerPath = path.join(config.fixtureStore, LOCAL_FOLDERS.sourceContent, "component-register.json");
    composition = new DryRunCompositionAdapter(config.home, registerPath, log);
  } else {
    composition = new FireflyCompositionStub();
  }

  return { config, storage, orchestration, composition, state, log, layout, now: options.now ?? (() => new Date()) };
}
