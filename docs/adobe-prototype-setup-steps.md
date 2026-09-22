# Adobe prototype: construction steps

**Assumptions:** Frame.io, InDesign, Acrobat Pro, Bridge, UXP Developer Tool, Node.js and Git are installed; the trials/accounts have been procured; approved public or synthetic content for the three documents is available. This checklist excludes storyboarding, recording and demo preparation.

| Step | Owner | Construction action | Completion check |
| ---: | --- | --- | --- |
| 1 | Human | Sign in to Adobe and Frame.io. Confirm the Frame.io account is V4 and connect Adobe Authentication if prompted. | Frame.io opens under the intended personal account. |
| 2 | Human | Create one Frame.io project and note its workspace/project names. | Empty project is visible. |
| 3 | Human | In Adobe Developer Console, create a project with Frame.io API user authentication and a localhost callback. Store the client values directly in the local secret file; never send them through chat or commit them. | OAuth credential and redirect URI exist. |
| 4 | Human | Create an empty private GitHub repository for application code only. Do not add business documents, Adobe packages, generated outputs or credentials. | Private repository URL is available to the agent. |
| 5 | Agent | Scaffold the TypeScript application and UXP plugin described in [the coding specification](adobe-prototype-application-spec.md), including `.gitignore`, `.env.example`, schemas, tests and local queue folders. | Install, typecheck and unit tests pass without secrets. |
| 6 | Human | Populate `.env.local` with Frame.io OAuth configuration and launch the agent-provided login command. Complete Adobe sign-in and consent in the browser. | A refreshable local user session is established; secrets remain ignored by Git. |
| 7 | Agent | Call the Frame.io discovery APIs and save the selected account, workspace, project and root-folder IDs in local ignored configuration. | Authenticated project listing succeeds. |
| 8 | Agent | Through the API, create `01 Source content`, `02 Templates and assets`, `03 Generated variants`, `04 Review and approved`, and request-state folders. Attempt lifecycle metadata fields; select folder mode automatically if unavailable. | Required folders exist and `triggerMode` is recorded as `metadata` or `folder`. |
| 9 | Agent | Prove Frame.io file transfer with one small synthetic file: upload, list, retrieve the original media link, download, compare its hash and move it between folders. | Round-trip hash matches and move succeeds. |
| 10 | Agent | Probe optional Frame.io features and record results without making them dependencies: Mounted Storage, multi-page INDD preview, comments, custom fields and version stacks. | Capability report is written locally; unsupported items are disabled. |
| 11 | Agent | Create the local queue and implement atomic job/result writes. Start the bare-bones orchestrator in dry-run mode against a synthetic request. | One request moves through `queued -> generating -> completed` without invoking InDesign. |
| 12 | Agent | Build the persistent InDesign UXP panel with queue-folder selection, persistent folder token, idle-task polling, one-job processing, preflight, INDD save and PDF export. | Plugin builds and its automated modules pass tests. |
| 13 | Human | Load the plugin in UXP Developer Tool, open its panel in InDesign, select the local queue folder and grant filesystem access. Keep InDesign and the panel open while builds run. | Panel reports `Worker ready`. |
| 14 | Agent | Run a UXP smoke job that opens a synthetic template, replaces one labelled text object, applies one brand value, saves an INDD, exports a PDF and writes a result file. | Expected INDD/PDF/result files exist; overset/preflight state is returned. |
| 15 | Human | If Firefly Services InDesign API is visible and usable in Developer Console, authorize a separate optional credential. Otherwise mark it unavailable; the local UXP path remains the baseline. | `compositionMode` is `firefly` or `uxp`; lack of Firefly access does not block construction. |
| 16 | Agent | Convert the supplied reusable content and data into stable component IDs, typed values and manifests. Generate the business-readable `content-library.indd` through the UXP helper. | Component register has no duplicate/unresolved IDs and the content library opens correctly. |
| 17 | Human | Provide or approve the three InDesign source layouts and identify the intended content, data, asset and form-control bindings. Resolve any visual ambiguity. | Binding worksheet is approved for form, short guide and long guide. |
| 18 | Agent | Convert the layouts into controlled templates, apply script labels/XML tags, create two brand packs, and add semantic form names, tooltips, options and tab order. | Template validator finds every manifest binding exactly once. |
| 19 | Agent | Run the end-to-end local path: detect the Frame.io request, download a snapshot, resolve affected variants, queue composition, collect results, upload outputs/release manifest and set success/failure state. | All intended outputs return to Frame.io; invalid input produces a visible failure. |
| 20 | Human | Open the generated form in Acrobat. Verify fields, radio/checkbox behaviour, tab order and save/reopen. Run Acrobat accessibility checks and manually inspect reading order, tables and field descriptions. | Form works; outputs are recorded only as `tagged and accessibility-checked`. |
| 21 | Agent | Run the final automated acceptance suite and produce a concise construction report listing passed checks and any dropped features under `Potential Limitations`. | All critical-path tests pass or the limitation is explicitly recorded. |

## Speed-first fallbacks

- Frame.io OAuth unavailable: use `LocalStorageAdapter`; Human manually transfers source/output files. Automated Frame.io integration drops into `Potential Limitations`.
- Custom metadata unavailable: use request-state folders and file/folder moves.
- Mounted Storage unreliable: use explicit API download/upload.
- Firefly Services unavailable: use the manually started local UXP worker.
- Advanced form logic unavailable from InDesign: finish only the necessary validation/calculation in Acrobat.
- UXP queue worker cannot be proven: stop; no equally fast documented personal-account composition path has been validated.
