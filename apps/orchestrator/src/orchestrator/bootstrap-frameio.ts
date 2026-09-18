import { BUILD_STATES } from "@prototype/contracts";
import { createTokenProvider } from "../adapters/frameio/auth.js";
import { FrameioClient } from "../adapters/frameio/client.js";
import { saveFrameioLayout, type FrameioLayout } from "../adapters/frameio/layout.js";
import { FrameioStorageAdapter } from "../adapters/frameio/storage.js";
import { requireFrameioCredentials, type AppConfig } from "../config.js";
import { PrototypeError, errorMessage } from "../domain/models.js";
import type { Logger } from "../log.js";

function pick<T extends { id: string }>(items: T[], configuredId: string | undefined, kind: string, envKey: string, nameOf: (item: T) => string): T {
  if (configuredId) {
    const found = items.find((item) => item.id === configuredId);
    if (!found) {
      throw new PrototypeError("bootstrap", `${kind} ${configuredId} was not found; available: ${items.map((item) => `${nameOf(item)} = ${item.id}`).join(", ") || "none"}`);
    }
    return found;
  }
  const [only] = items;
  if (only && items.length === 1) {
    return only;
  }
  throw new PrototypeError("bootstrap", `${items.length} ${kind}s are visible; set ${envKey} in .env.local to one of: ${items.map((item) => `${nameOf(item)} = ${item.id}`).join(", ") || "none"}`);
}

/** Discover account/workspace/project, create the folder layout and save `.prototype/frameio.json`. */
export async function bootstrapFrameio(config: AppConfig, log: Logger): Promise<FrameioLayout> {
  const credentials = requireFrameioCredentials(config);
  const client = new FrameioClient(createTokenProvider(credentials, config.home, log));
  const me = await client.me();
  log.info(`signed in to Frame.io as ${me.name}`);

  const account = pick(await client.accounts(), config.frameio.accountId, "account", "FRAMEIO_ACCOUNT_ID", (a) => a.display_name);
  const workspace = pick(await client.workspaces(account.id), config.frameio.workspaceId, "workspace", "FRAMEIO_WORKSPACE_ID", (w) => w.name);
  const project = pick(await client.projects(account.id, workspace.id), config.frameio.projectId, "project", "FRAMEIO_PROJECT_ID", (p) => p.name);
  log.info(`using account ${account.display_name}, workspace ${workspace.name}, project ${project.name}`);

  const storage = new FrameioStorageAdapter(client, account.id, log);
  const root = project.root_folder_id;
  const requests = await storage.createFolder(root, "00 Requests");
  const states = {} as Record<(typeof BUILD_STATES)[number], string>;
  for (const state of BUILD_STATES) {
    states[state] = (await storage.createFolder(requests.id, state)).id;
  }
  const sourceContent = await storage.createFolder(root, "01 Source content");
  const templatesAndAssets = await storage.createFolder(root, "02 Templates and assets");
  const templates = await storage.createFolder(templatesAndAssets.id, "templates");
  const brands = await storage.createFolder(templatesAndAssets.id, "brands");
  const assets = await storage.createFolder(templatesAndAssets.id, "assets");
  const documentManifests = await storage.createFolder(templatesAndAssets.id, "document-manifests");
  const generatedVariants = await storage.createFolder(root, "03 Generated variants");
  const reviewAndApproved = await storage.createFolder(root, "04 Review and approved");
  log.info("folder layout is in place");

  let metadata: unknown;
  let metadataAvailable = false;
  try {
    const definitions = await client.fieldDefinitions(account.id);
    metadata = definitions.map((definition) => ({ id: definition.id, name: definition.name, type: definition.field_type }));
    metadataAvailable = true;
    log.info(`custom metadata fields visible: ${definitions.length}`);
  } catch (error) {
    metadata = `unavailable: ${errorMessage(error)}`;
    log.warn(`custom metadata is not available on this account: ${errorMessage(error)}`);
  }
  if (config.triggerMode === "metadata") {
    log.warn("TRIGGER_MODE=metadata was requested, but only folder triggers are implemented; recording triggerMode=folder");
  }

  const sourceChildren = await storage.listChildren(sourceContent.id);
  const library = sourceChildren.find((item) => item.type === "file" && /\.indd$/i.test(item.name));
  const data = sourceChildren.find((item) => item.type === "file" && /\.csv$/i.test(item.name));
  const layout: FrameioLayout = {
    schemaVersion: 1,
    accountId: account.id,
    workspaceId: workspace.id,
    projectId: project.id,
    projectName: project.name,
    rootFolderId: root,
    triggerMode: "folder",
    folders: {
      requests: requests.id,
      states,
      sourceContent: sourceContent.id,
      templatesAndAssets: templatesAndAssets.id,
      templates: templates.id,
      brands: brands.id,
      assets: assets.id,
      documentManifests: documentManifests.id,
      generatedVariants: generatedVariants.id,
      reviewAndApproved: reviewAndApproved.id,
    },
    defaults: {
      manifestFolderId: documentManifests.id,
      templateFolderId: templates.id,
      assetFolderId: assets.id,
      brandFolderId: brands.id,
      ...(library ? { contentLibraryFileId: library.id } : {}),
      ...(data ? { dataFileId: data.id } : {}),
    },
    capabilities: { metadataFieldDefinitions: metadata, metadataAvailable, bootstrappedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  await saveFrameioLayout(config.home, layout);
  if (!library || !data) {
    log.warn("01 Source content does not yet hold a content library (.indd) and product data (.csv); re-run bootstrap after uploading them so request defaults are recorded");
  }
  return layout;
}
