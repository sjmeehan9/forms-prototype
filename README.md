# forms-prototype

Local orchestrator and InDesign UXP queue worker for the Adobe-based Keystone alternative prototype.
The orchestrator mocks Workfront orchestration over Frame.io (or a local folder store), resolves reusable
content, product data, brand packs and templates into one bundle per document and brand, and hands
composition to a manually started InDesign panel. Outputs and release evidence return to the same store.

## Requirements

- Node.js 22 or later and npm 10 or later.
- macOS with Adobe InDesign 2025 or 2026 (UXP panels need InDesign 18.5+) and the Adobe UXP Developer Tool.
- For Frame.io mode: a Frame.io V4 account and an Adobe Developer Console project with an OAuth Web App
  credential for the Frame.io API. The registered redirect URI must be `https://localhost:4319/oauth/callback`
  (Adobe requires HTTPS even for localhost).
- `mkcert` for a browser-trusted local certificate: `brew install mkcert && mkcert -install`. Without it the
  login command falls back to an openssl self-signed certificate and the browser warns once.

## Install

```bash
npm install
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

npm may warn that esbuild's postinstall script was not run because of the install-script policy. The
platform binary ships as a normal dependency, so builds work regardless.

## Configuration

Copy `.env.example` to `.env.local` and fill in the values. `.env.local` is ignored by git; never paste the
client id or secret anywhere else.

| Variable | Default | Meaning |
| --- | --- | --- |
| `FRAMEIO_CLIENT_ID`, `FRAMEIO_CLIENT_SECRET` | | Adobe Developer Console OAuth Web App credential. |
| `FRAMEIO_REDIRECT_URI` | `https://localhost:4319/oauth/callback` | Must match the console's default redirect URI exactly. |
| `FRAMEIO_ACCOUNT_ID`, `FRAMEIO_WORKSPACE_ID`, `FRAMEIO_PROJECT_ID` | | Optional. Bootstrap auto-selects when exactly one exists and otherwise lists the ids to choose from. |
| `STORAGE_MODE` | `frameio` | `frameio` or `local`. |
| `TRIGGER_MODE` | `folder` | Folder moves drive the state machine. `metadata` is recorded as a documented option only. |
| `COMPOSITION_MODE` | `uxp` | `uxp` (InDesign panel), `dry-run` (placeholder outputs, no InDesign) or `firefly` (stub). |
| `POLL_INTERVAL_MS` | `5000` | Polling interval for `watch`. |
| `UXP_JOB_TIMEOUT_MS` | `120000` | How long to wait for the InDesign panel to answer one job. |
| `PROTOTYPE_HOME` | `.prototype` | Folder the InDesign panel is granted access to. Everything InDesign touches lives inside it. |
| `LOCAL_STORAGE_ROOT` | `<home>/local-frameio` | Mutable local store for `STORAGE_MODE=local`, seeded from `fixtures/frameio`. |
| `FIXTURE_STORE` | `fixtures/frameio` | Pristine synthetic store used to seed local mode and the dry-run register. |
| `TLS_CERT_FILE`, `TLS_KEY_FILE` | `<home>/tls/localhost*.pem` | Certificate for the local OAuth callback. |

Files the application keeps under `PROTOTYPE_HOME` (all ignored by git): `auth.json` (OAuth tokens, mode 600),
`frameio.json` (discovered ids and folder layout), `state.json` and `state.local.json` (processed requests and
the last successful source snapshot, one per storage mode), `capabilities.json`, `tls/`, `queue/{inbox,processing,outbox,failed}`, `work/<request>/`
and `local-frameio/`.

## Frame.io setup (one time)

1. Sign in and save a refreshable session. The command creates the certificate on first use, starts the
   HTTPS callback listener, opens the Adobe sign-in page and closes the listener when the code arrives.

   ```bash
   npm run auth:frameio
   ```

2. Discover the account, workspace and project and create the folder layout (`00 Requests` with the four
   state folders, `01 Source content`, `02 Templates and assets` with `templates`, `brands`, `assets` and
   `document-manifests`, `03 Generated variants`, `04 Review and approved`). The layout is saved to
   `.prototype/frameio.json`. Re-run after uploading the content library and product data so their file ids are
   recorded as request defaults.

   ```bash
   npm run bootstrap:frameio
   ```

3. Prove file transfer with one synthetic file: upload, list, original download with hash comparison, file and
   folder moves. Optional features (custom metadata fields, file metadata, version stacks, comments) are
   recorded in `.prototype/capabilities.json` without becoming dependencies. The probe folder is deleted
   afterwards unless you pass `--keep`.

   ```bash
   npm run probe:frameio
   ```

4. Optional: upload the synthetic fixture into the layout and queue a request, to exercise the Frame.io loop
   before real InDesign files exist. `--replace` swaps same-named files; `--request <name>` creates a request
   folder in `Ready to generate`.

   ```bash
   npm run seed:frameio -- --request req-001-initial-build
   ```

## InDesign panel (UXP)

1. Build the plugin bundle into `apps/indesign-plugin/dist`.

   ```bash
   npm run plugin:build
   ```

2. In UXP Developer Tool choose Add Plugin, select `apps/indesign-plugin/dist/manifest.json`, then Load.
   The panel appears in InDesign under Plugins as Prototype Queue Worker.
3. Click Select .prototype folder and choose the repository's `.prototype` folder (the same folder as
   `PROTOTYPE_HOME`). The choice is remembered across InDesign sessions.
4. Click Start worker. Keep InDesign and the panel open while builds run; the worker scans `queue/inbox` every
   two seconds and processes one job at a time. Results are written atomically to `queue/outbox`.
5. Smoke test with real InDesign files. The first command asks the panel to build a synthetic content library
   and the three templates from the fixture into the local store (`.prototype/local-frameio`). The second runs
   the seeded request through the genuine extract and compose path; outputs land in
   `.prototype/local-frameio/03 Generated variants`.

   ```bash
   npm run samples:create
   ```

   ```bash
   npm run prototype -- --storage local --composition uxp run req-001-initial-build
   ```

   To move the real library and templates into Frame.io afterwards, replacing the text placeholders:

   ```bash
   npm run seed:frameio -- --from .prototype/local-frameio --replace
   ```

## Running

Watch the `Ready to generate` folder and process requests one at a time:

```bash
npm run prototype -- watch
```

Process one request folder by name:

```bash
npm run prototype -- run req-001-initial-build
```

Global options go before the command: `--storage local|frameio`, `--composition uxp|dry-run|firefly`,
`--home <dir>`. For example `npm run prototype -- --composition dry-run watch` exercises the Frame.io loop
without InDesign.

Create a request folder from the terminal instead of the Frame.io UI (optionally limited to some documents or
brands, or staging a deliberately invalid `request.json` with `--json <file> --raw`):

```bash
npm run request:frameio -- req-005-example
```

A request is a folder inside `00 Requests/Ready to generate`. It may contain a `request.json`
(`schemaVersion`, `requestId`, `requestedAt`, optional `source` ids, optional `documentIds` and `brandIds`);
without one, the ids recorded by bootstrap are used. The folder moves to `Generating`, then to
`Ready for review` or `Failed`. Outputs land in `03 Generated variants/<release-id>/<brand>/` with
`release-manifest.json`, `release-report.md` and an `evidence/` folder; the request folder receives the
manifest and report, or `failure.json` when the run fails.

## Local mode without Adobe or Frame.io

Run three synthetic requests through a throwaway copy of the fixture store with dry-run composition. The
first request builds every output, the second changes one product data value and rebuilds only the documents
that bind it, and the third fails visibly on a manifest with a missing component reference.

```bash
npm run fixture:e2e
```

`STORAGE_MODE=local` runs `watch` and `run` against `.prototype/local-frameio`, seeded from `fixtures/frameio`
on first use.

## Authoring conventions

- Content library: each reusable story is a text frame labelled `component:<id>` (or a script label with key
  `prototype.componentId`). Optional script labels `prototype.status`, `prototype.owner`,
  `prototype.effectiveFrom` and `prototype.effectiveTo` carry governance values. Paragraph style names are the
  semantic styles that a manifest's `styleMap` maps to template styles.
- Templates: every target object carries a script label equal to the binding target, for example
  `content:privacy.notice`, `data:contact.phone` or `asset:brand.logo`. Data targets are dedicated frames
  because the whole story is replaced. Form controls are labelled with the field's `binding` value
  (`field:<name>`). Swatches are named as in the brand pack.
- Document manifests, brand packs and the product data CSV follow the schemas in
  `packages/contracts/src/index.ts`; `fixtures/frameio` is a complete synthetic example.

## Layout

```text
apps/orchestrator/        Node CLI: config, domain logic, adapters, orchestration
apps/indesign-plugin/     InDesign UXP panel (manifest v5), built with esbuild into dist/
packages/contracts/       Zod schemas and types shared by both
fixtures/frameio/         Synthetic store: requests, source content, templates, brands, manifests
```
