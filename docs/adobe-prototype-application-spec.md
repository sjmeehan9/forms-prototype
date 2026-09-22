# Adobe prototype: local application coding specification

**Priority:** shortest path to a working prototype. Prefer obvious code, synchronous sequencing and hard failures over production resilience.

## Goal

Build a local TypeScript application and InDesign UXP plugin that detect a Frame.io generation request, retrieve the latest source package, extract reusable content from an InDesign library, resolve affected document/brand variants, compose them in desktop InDesign, and return INDD/PDF outputs plus release evidence to Frame.io.

## Locked technical choices

- Node.js 22+, TypeScript in strict ESM mode, npm workspaces.
- Use Node's built-in `fetch`, filesystem, HTTP and crypto APIs; add only `zod`, `csv-parse`, `commander`, `vitest` and a small bundler such as `esbuild`.
- Use a thin Frame.io REST client around the live V4 contract. The official TypeScript SDK may be used for OAuth/upload if it removes code, but keep it behind the same adapter.
- Default to folder-triggered orchestration and explicit API download/upload. Metadata triggers and Mounted Storage are optional configuration.
- Default to a persistent UXP panel for InDesign 18.5+ using manifest v5 and a user-approved queue folder.
- Firefly Services InDesign API is optional: do not implement it unless entitlement is proven; provide an adapter stub only.
- Process one request and one composition job at a time. No database, message broker, web application, scheduler, webhook, deployment platform or GitHub Actions.

## Repository layout

```text
apps/orchestrator/
  src/cli.ts
  src/config.ts
  src/orchestrator/poller.ts
  src/orchestrator/run-request.ts
  src/domain/{models,schemas,dependency-graph,change-detector,resolver,release}.ts
  src/adapters/frameio/{auth,client,storage,orchestration}.ts
  src/adapters/local/{storage,orchestration}.ts
  src/adapters/composition/{local-queue,firefly-stub}.ts
  test/
apps/indesign-plugin/
  manifest.json
  src/{panel,queue-worker,extract-content,compose,preflight,export}.ts
  index.html
packages/contracts/
  src/index.ts
fixtures/
  source-package/
.env.example
.gitignore
README.md
```

`packages/contracts` must contain JSON-safe types and Zod schemas shared by Node and the bundled UXP plugin. Do not import Node-only modules into the plugin.

## Runtime flow

1. `prototype watch` polls the configured Frame.io `Ready to generate` folder every five seconds.
2. Each child request folder contains `request.json`. Claim it by moving the folder to `Generating`; local state prevents duplicate processing.
3. Download the named content library, data, templates, brand packs, assets and manifests to `.prototype/work/<request-id>/source`.
4. Write an `extract-content` UXP job atomically to `queue/inbox` and wait for its result in `queue/outbox`.
5. Validate the extracted component register and data; compare them with the last successful snapshot; build a dependency graph and select affected outputs.
6. Write one `compose-document` job for each affected document/brand pair. Process sequentially.
7. On success, create `release-manifest.json`, upload outputs/evidence under `03 Generated variants/<release-id>/`, and move the request to `Ready for review`.
8. On failure, write a short `failure.json`, upload it where possible, move the request to `Failed`, log the error and stop that request. Do not retry automatically.

The `LocalStorageAdapter` must mirror the same flow using folders under `fixtures/frameio/`; it is both the API fallback and the default automated-test surface.

## Contracts

Use `schemaVersion: 1` and reject unknown schema versions.

### Build request

```ts
type BuildRequest = {
  schemaVersion: 1;
  requestId: string;
  requestedAt: string;
  source: {
    contentLibraryFileId: string;
    dataFileId: string;
    manifestFolderId: string;
    templateFolderId: string;
    assetFolderId: string;
  };
  documentIds?: string[];
  brandIds?: string[];
};
```

For local fixtures, IDs are relative paths rather than Frame.io UUIDs.

### Extracted components

```ts
type ComponentRegister = {
  schemaVersion: 1;
  sourceHash: string;
  components: Array<{
    id: string;
    status: "approved" | "draft";
    owner?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    blocks: Array<
      | { type: "paragraph"; text: string; style?: string }
      | { type: "list-item"; text: string; level: number; style?: string }
    >;
  }>;
};
```

MVP rich text is paragraphs and list items only. Document-specific complex tables remain in templates or structured data and are a `Potential Limitation`.

### Product data

Use CSV columns `key,value,type,status,effectiveFrom,effectiveTo,source`. Support `string`, `number`, `date` and `boolean`; reject duplicate keys and non-approved values.

### Document manifest

```ts
type DocumentManifest = {
  schemaVersion: 1;
  id: string;
  archetype: "form" | "short-guide" | "long-guide";
  templateId: string;
  bindings: Array<{
    target: string;
    source:
      | { type: "component"; id: string }
      | { type: "data"; key: string }
      | { type: "asset"; id: string };
  }>;
  brandIds: string[];
  output: { printPdf: boolean; interactivePdf: boolean; saveIndd: boolean };
};
```

### Brand pack

Include `id`, `name`, `swatches`, `assets` and optional `mandatoryComponentIds`. Swatches map semantic names to CMYK/RGB values; assets map semantic names such as `brand.logo` to asset IDs.

### Form fields

For the form archetype support `text`, `checkbox`, `radio`, `combo`, `list`, `button` and `signature`. Each field has `name`, `binding`, `description`, `required`, `readOnly`, `exportValue`, `group`, `options` and `tabOrder` as applicable. Advanced calculations and validation are out of scope.

### Queue protocol

```ts
type UxpJob =
  | { schemaVersion: 1; jobId: string; type: "extract-content"; inputIndd: string; outputJson: string }
  | { schemaVersion: 1; jobId: string; type: "compose-document"; template: string; bundle: string; outputDir: string };

type UxpResult = {
  schemaVersion: 1;
  jobId: string;
  status: "completed" | "failed";
  outputs: string[];
  checks: { overset: boolean; missingLinks: string[]; missingFonts: string[]; preflightErrors: string[] };
  error?: string;
};
```

Node writes `<job-id>.tmp` then renames it to `<job-id>.json`. UXP writes results the same way. Use `inbox`, `processing`, `outbox` and `failed` directories. A 120-second timeout is sufficient; expose it in configuration.

### Release manifest

Record release/request IDs, timestamp, application version, source Frame.io IDs/versions where available, SHA-256 hashes for all source and output files, component/data/template/brand versions, affected output IDs, validation results and final status. Serialize keys deterministically before hashing.

## Role 1: mock orchestration

Implement only:

- `watch`: poll, claim and process the next request folder.
- `run <request-id>`: process one known request.
- `bootstrap-frameio`: discover account/workspace/project and create required folders.
- `auth-frameio`: run local OAuth callback and save refreshable credentials to ignored local storage.
- Visible states: `Ready to generate`, `Generating`, `Ready for review`, `Failed`.
- A local `.prototype/state.json` containing processed request IDs and last successful source snapshot.

There is no orchestration UI. Console logs are enough. No scheduling, concurrency, retries, cancellation, role model or approval workflow.

## Role 2: reusable modules

### Adapter interfaces

```ts
interface StorageAdapter {
  listChildren(parentId: string): Promise<StoredItem[]>;
  createFolder(parentId: string, name: string): Promise<StoredItem>;
  download(fileId: string, destination: string): Promise<StoredFile>;
  upload(parentId: string, sourcePath: string): Promise<StoredFile>;
  move(item: StoredItem, parentId: string): Promise<void>;
}

interface OrchestrationAdapter {
  nextRequest(): Promise<BuildRequestRef | null>;
  claim(request: BuildRequestRef): Promise<void>;
  setState(request: BuildRequestRef, state: BuildState, detail?: string): Promise<void>;
}

interface CompositionAdapter {
  submit(job: UxpJob): Promise<void>;
  wait(jobId: string): Promise<UxpResult>;
}
```

Keep domain modules free of Frame.io, filesystem and InDesign imports.

### Frame.io adapter

- Authenticate with Adobe IMS user OAuth; never implement server-to-server for this prototype.
- Use current V4 paths and operation semantics for discovery, folder children/create/move, file show/move, local upload and metadata.
- Download with `files.show?include=media_links.original`, then follow `data.media_links.original.download_url`.
- Upload by requesting `files.create_local_upload` with `name` and `file_size`, then use the returned presigned upload URL/official SDK helper. Verify the uploaded size/hash by downloading once during setup.
- Use folder moves for the baseline state machine. Metadata bulk update is optional.
- Do not log access/refresh tokens or signed URLs.

### Dependency and change modules

- Build reverse indexes from every component, data key, asset, template and brand to its document/brand output targets.
- Hash normalized components/data/manifests/assets/templates. Compare current and last successful snapshots.
- First run builds all requested targets. Later runs build only targets reached from changed inputs.
- Sort IDs and object keys so the same inputs produce the same snapshot and release hashes.
- Reject missing references, duplicate IDs, expired/unapproved components or data, and unsupported binding types before queueing InDesign.

### Resolver

- Merge the document manifest, selected brand pack, approved components and typed data into one JSON `ResolvedDocumentBundle` per output.
- Resolve conditions before composition; do not put business rules in an InDesign template.
- Emit explicit bindings keyed by template target. The UXP worker must not query Frame.io or infer component relationships.

## InDesign UXP plugin

- Manifest v5, host minimum InDesign 18.5, panel entry point, `localFileSystem: request`; no network permission.
- Panel controls: `Select queue folder`, `Start worker`, `Stop worker`; show queue path, worker state, current job and last result.
- Persist the user-selected queue folder token across InDesign sessions.
- Create one idle task that scans `inbox` every two seconds while the worker is enabled.
- `extract-content`: open the library, find text frames carrying `prototype.componentId` script labels or `component:<id>` labels, extract paragraphs/list items and styles, write the register, then close without changing the source.
- `compose-document`: open the template, locate labelled targets, insert resolved text/data, place/relink assets, apply named styles/swatches, configure existing form controls, save a new INDD and export requested PDF profiles.
- Never overwrite the source library or template.
- Hard-fail on duplicate/missing target labels, overset text, missing/outdated links, missing fonts or InDesign preflight errors.
- A failed job must still produce `UxpResult` with concise diagnostics.

Use template-authored form controls where possible. The plugin sets semantic names, descriptions, required/read-only flags, export values and tab order from the bundle; Acrobat remains the manual check/finalization tool.

## Configuration

`.env.example` must include only names and safe defaults:

```dotenv
FRAMEIO_CLIENT_ID=
FRAMEIO_CLIENT_SECRET=
FRAMEIO_REDIRECT_URI=http://127.0.0.1:4319/oauth/callback
FRAMEIO_ACCOUNT_ID=
FRAMEIO_WORKSPACE_ID=
FRAMEIO_PROJECT_ID=
STORAGE_MODE=frameio
TRIGGER_MODE=folder
POLL_INTERVAL_MS=5000
UXP_JOB_TIMEOUT_MS=120000
PROTOTYPE_HOME=.prototype
```

Store OAuth tokens under `.prototype/auth.json` with restrictive local permissions. Gitignore `.env.local`, `.prototype`, queue contents, Adobe packages, outputs and credentials.

## Commands

```text
npm install
npm run typecheck
npm test
npm run build
npm run auth:frameio
npm run bootstrap:frameio
npm run prototype -- watch
npm run prototype -- run <request-id>
npm run plugin:build
```

Provide `npm run fixture:e2e` using `LocalStorageAdapter`; it must not need Adobe or Frame.io. UXP execution remains a human-started integration check.

## Tests

### Automated

- Contract validation and rejection of unknown versions/duplicate IDs.
- Dependency propagation from one shared component to all referencing targets.
- Data, brand and template changes select the correct outputs.
- Deterministic snapshot/release hashes.
- Resolver output and missing/unapproved reference failures.
- Local folder state transitions and queue atomic-write/result parsing.
- Frame.io adapter round trip behind an explicit integration-test environment flag.

### Manual integration

- Human loads plugin, selects queue folder and starts worker.
- Extract job returns expected component IDs.
- Compose job changes labelled text and one visual brand value, emits INDD/PDF and reports no overset/missing resources.
- Acrobat confirms semantic fields, tab order and save/reopen.

## Definition of done

- A folder-based request moves through all four visible states.
- One shared component update rebuilds all three document archetypes across two brands; an unrelated output is not rebuilt.
- Outputs and release evidence return to Frame.io, or to the local adapter when Frame.io access is unavailable.
- A deliberately missing binding produces `Failed` with understandable evidence.
- Unit/type checks and local fixture E2E pass.
- README contains only install, configuration, UXP loading and run instructions; it does not contain storyboard/recording guidance.

## Potential limitations

Move rather than solve these if the spike does not prove them:

- Automated Frame.io integration on the selected personal account.
- Mounted Storage round-trip editing and custom metadata triggers.
- Firefly Services InDesign API composition.
- External unattended launch/invocation of desktop InDesign.
- Advanced form calculation/validation beyond Acrobat finishing.
- Shared rich-text tables or arbitrary inline formatting in reusable components.
- PDF/UA conformance, simultaneous co-authoring, independent approvals, immutable audit, scale, retries and production operations.
