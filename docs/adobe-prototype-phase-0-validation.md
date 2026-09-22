# Adobe prototype: Phase 0 technical validation

**Research date:** 18 September 2026

## Outcome

The fastest defensible build is a local Node.js/TypeScript orchestrator plus a persistent UXP panel for InDesign. The orchestrator polls Frame.io, transfers a source snapshot, resolves affected variants and writes a local composition job. The user opens InDesign and starts the panel once; the panel polls that queue, composes and exports the documents, and returns a result for upload to Frame.io. Firefly Services InDesign API is optional because Adobe documents enterprise provisioning, not personal-trial entitlement.

## Validation results

| Technical spike | Evidence result | Prototype decision |
| --- | --- | --- |
| Frame.io free/trial capacity | **Partly confirmed.** Free currently advertises 2 members, 2 projects, 2 GB storage and 2 GB Mounted Storage. Plan-specific API and custom-field access are not guaranteed in public docs. | Verify on the actual account. Use one project and small synthetic assets. |
| Frame.io user authentication | **Partly confirmed.** V4 uses Adobe IMS OAuth. User authentication supports Adobe-managed accounts and Frame-managed accounts connected to Adobe Authentication; access for every personal/free account is not guaranteed. Server-to-server requires an Adobe Admin Console-managed account. | Use user OAuth only. If unavailable, switch to local storage and manual Frame.io transfer. |
| Required Frame.io file operations | **Confirmed in the live V4 OpenAPI.** Non-deprecated operations cover account/workspace/project discovery, folder listing/creation/move, file retrieval/move, local-upload creation, original media links, metadata read/update and comments. | Implement only discovery, folder polling, explicit download/upload, move and status/comment operations. |
| Frame.io trigger | **Confirmed with a caveat.** Project metadata values can be bulk-updated, but plan access must be tested. Folder and file move operations are stable. | Prefer `Lifecycle status=Ready to generate`; fall back to moving a request into a `Ready to generate` folder. |
| Frame.io webhooks/actions/version stacks | **Confirmed but unnecessary.** The live OpenAPI now exposes non-deprecated webhook, custom-action and version-stack creation operations; update/delete/reorder for version stacks were not found. | Exclude from MVP. Poll every 5 seconds and write each build to a unique release folder. |
| Frame.io InDesign handling | **Partly confirmed.** Adobe documents Mounted Storage and announced full multi-page INDD previews on all plans. Public docs do not prove reliable round-trip editing of packaged files, fonts and links. | Test Mounted Storage, but make explicit API download/upload the baseline. |
| Firefly Services InDesign API | **Capability confirmed; personal access unproven.** It supports asynchronous Data Merge, Rendition, Custom Scripts, Job Status, Document Info and PDF-to-InDesign. Adobe's onboarding requires enterprise admin/developer roles and assignment of `Firefly - Firefly Services`. | Keep behind an optional `CompositionAdapter`; do not block the prototype on it. |
| Local InDesign automation | **Confirmed.** UXP scripts require InDesign 18.0+; plugins/panels require 18.5+. UXP exposes filesystem permissions, persistent folder tokens, idle tasks, labels/XML, document content/styles, preflight and PDF export. | Build a persistent panel for InDesign 18.5+ that polls a user-approved local queue folder. |
| External unattended UXP invocation | **Not confirmed.** No current official contract was found for a Node process to invoke a desktop UXP command unattended. macOS UI scripting is not an acceptable API substitute. | Human starts InDesign and the UXP panel once. Drop fully unattended desktop execution from the demo. |
| Fillable PDF | **Confirmed for the proof.** InDesign supports text fields, checkboxes, radio buttons, lists, combo boxes, buttons and signature fields, including names, descriptions, required/read-only options, export values and tagged-PDF tab order. Advanced validation/calculation belongs in Acrobat. | Prove basic fields and tab order; perform any advanced finishing and checks in Acrobat Pro. |
| Accessibility | **Partly confirmed.** InDesign exports tagged structure; Acrobat checks accessibility and supports PDF/UA-related preflight. Adobe still requires manual checks for reading order, tables, field descriptions and semantics. | Claim only `tagged and accessibility-checked`; do not claim PDF/UA conformance. |

## Confirmed Frame.io API surface

- Discovery: `accounts.index`, `workspaces.index`, `projects.index`, `folders.index`.
- Storage: `folders.create`, `folders.move`, `files.show`, `files.move`, `files.create_local_upload`.
- Download: request `files.show?include=media_links.original`; the link can be absent or return `403` without download permission.
- Upload: `files.create_local_upload` accepts `name` and `file_size` and returns presigned `upload_urls`; the byte-transfer details must be verified from the returned URL/SDK because the OpenAPI does not define a completion endpoint.
- Metadata: `metadata.show`, `metadata.bulk_update`, and field-definition list/create/update.
- Optional only: comments, shares, webhooks, custom actions and version stacks.

## Locked Phase 0 architecture

1. Node process polls a Frame.io metadata state or folder and downloads the latest source package.
2. Domain modules validate inputs, resolve reusable content and variants, calculate affected outputs and write `queue/inbox/<job-id>.json` atomically.
3. A manually started UXP panel uses an idle task to process one queued job at a time.
4. UXP updates labelled InDesign objects, runs preflight, saves INDD files, exports PDFs and writes `queue/outbox/<job-id>.result.json`.
5. Node uploads outputs and a release manifest, then sets `Ready for review` or `Failed`.
6. Acrobat supplies the manual form and accessibility gate.

## Potential limitations

- Frame.io API or custom metadata may not be enabled for the selected personal/free account.
- Mounted Storage may not preserve a reliable INDD package, font and linked-asset round trip.
- Personal Creative Cloud trials are not publicly evidenced as eligible for Firefly Services InDesign API.
- Desktop InDesign cannot be claimed as unattended; the application depends on an open, manually started UXP panel.
- Advanced PDF validation/calculation may require manual Acrobat configuration.
- Tagged output and Acrobat checks do not establish PDF/UA conformance.
- Trial duration, production licensing, enterprise scale, independent approvals, immutable audit and AEM/Workfront integration are not proven.

If Frame.io OAuth fails, remove automated Frame.io integration from the demo and use the local filesystem adapter with manual upload/download. If the UXP queue spike fails, stop the build: no equally fast, documented personal-account composition path has been established.

## Human-only checks

- Sign in to Adobe and Frame.io and connect Adobe Authentication if required.
- Create the Adobe Developer Console OAuth project and approve browser consent.
- Confirm whether Firefly Services appears as an assignable/usable API; no purchase is required for the baseline.
- Load the UXP plugin through UXP Developer Tool, approve its queue folder and keep the panel open.
- Perform final Acrobat form, reading-order and accessibility checks.

## Sources

- [Frame.io pricing](https://frame.io/pricing)
- [Frame.io V4 getting started](https://next.developer.frame.io/platform/v4/docs/getting-started.md) and [authentication](https://next.developer.frame.io/platform/v4/docs/guides/authentication/overview.md)
- [Frame.io V4 OpenAPI](https://api.frame.io/v4/openapi.json)
- [Frame.io Mounted Storage](https://help.frame.io/en/articles/14501614-getting-started-with-frame-io-drive-mounted-storage) and [InDesign preview announcement](https://blog.frame.io/2026/09/08/new-in-frame-io-indesign-previews-spacebar-quicklook-and-ibc-2026/)
- [Firefly Services getting started](https://developer.adobe.com/firefly-services/docs/guides/get-started) and [InDesign APIs](https://developer.adobe.com/firefly-services/docs/indesign-apis/)
- [InDesign UXP scripts and plugins](https://developer.adobe.com/indesign/uxp/introduction/next-steps/script-and-plugin/), [file operations](https://developer.adobe.com/indesign/uxp/resources/recipes/file-operation/) and [IdleTasks](https://developer.adobe.com/indesign/uxp/dom/api/i/idle-tasks/)
- [InDesign fillable forms](https://helpx.adobe.com/indesign/desktop/interactive-elements-and-forms/forms-and-pdfs/create-fillable-forms.html) and [accessible PDF tags](https://helpx.adobe.com/indesign/desktop/interactive-elements-and-forms/forms-and-pdfs/use-tags-for-accessible-pdfs.html)
- [Acrobat accessibility checks](https://helpx.adobe.com/au/acrobat/using/create-verify-pdf-accessibility.html) and [Preflight](https://helpx.adobe.com/acrobat/using/analyzing-documents-preflight-tool-acrobat.html)
