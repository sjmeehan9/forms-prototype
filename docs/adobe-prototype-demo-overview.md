# Adobe-based alternative to Keystone: what the prototype shows

**Date:** 21 September 2026. **Audience:** business and technology stakeholders.

## In one paragraph

The prototype tests whether Adobe tools the organisation already knows can deliver the core of what Objective Keystone offers for forms and guides: write content once, reuse it everywhere, and regenerate every affected document when something changes. A business user edits content and templates in InDesign, stores them in a shared Frame.io workspace and asks for generation. A small hidden service works out what is affected and has InDesign rebuild only those documents, for each brand, then returns the results with evidence to the same workspace.

## What the demo shows

- **Write once, reuse everywhere.** One privacy statement feeds three forms. Changing it rebuilds all six outputs.
- **It knows where things are used.** Changing the help line hours rebuilds four outputs and leaves the two that do not use it alone.
- **Brands without copying.** Two brands share the same content. Logos, colours, fund names, identifiers and contact details come from brand packs and governed data.
- **Controlled templates.** Layout lives in templates. Nobody edits output files by hand.
- **Fillable forms.** 150 form fields across three forms, named from one shared dictionary, with tooltips and tab order.
- **Evidence with every release.** Each run records what changed, what was rebuilt and why, file fingerprints, and check results.
- **Bad input stops the line.** Draft or expired content, missing assets, overset text or a failed InDesign preflight produce a visible failure, never a quiet bad document.

## What was built

| Piece | Role |
| --- | --- |
| Frame.io workspace | Where users find sources, templates, requests, results and evidence |
| InDesign content library | 27 reusable stories a business user edits as normal text |
| InDesign templates | Three forms modelled on real layouts, with all copy, logos and images replaced |
| InDesign panel | Extracts content, builds templates, composes documents, runs preflight, exports PDF |
| Orchestration service | Stands in for Workfront: detects requests, finds affected outputs, resolves brand and data, returns results |
| Ingestion tooling | Measures a reference PDF so a template can be rebuilt faithfully without copying it |
| Quality net | 56 automated tests, plus hard checks inside every run |

The document set is a two-page transfer request, a three-page fund nomination with a compliance letter, and a six-page change of details form with a guide page. All content is synthetic.

## Prototype, production and Keystone compared

| Capability | This prototype today | A production Adobe build | Keystone-class system |
| --- | --- | --- | --- |
| Reusable content | Proven. Stories live in an InDesign library | Same model in governed storage such as AEM | Core strength, managed at fine grain |
| Where-used and cascading change | Proven, automatic and selective | Same logic, triggered by Workfront | Built in |
| Brand and product variants | Proven for two brands | Scales with brand packs and data | Built in |
| Authoring experience | InDesign desktop, familiar to designers | InDesign, optionally AEM for web content | Browser authoring for business users |
| Fillable PDF forms | Proven; advanced field rules finished in Acrobat | Same, with finishing rules automated | Depends on configuration |
| Workflow, approvals, audit | Pattern only: status folders and release evidence | Workfront provides workflow, approval and audit | Built in, including content-level verification |
| Unattended, at scale | No. Needs InDesign open on a desktop | Yes, with App Builder actions calling Adobe's InDesign API, or InDesign Server | Yes |
| Accessibility | Tagged and checked in Acrobat | Same, with a defined remediation step | Depends on configuration |
| Cost and skills | Existing Adobe licences and skills plus a small service | Adds Workfront, AEM, App Builder and a supported composition service | New platform, licence and skills |

Keystone entries describe the class of product in general terms and should be confirmed with the vendor.

## Production option: Adobe App Builder

The prototype's service is deliberately split into decision logic (validation, where-used, brand and data resolution, release evidence) and replaceable adapters (storage, orchestration, composition). That split maps onto Adobe App Builder, Adobe's platform for enterprise customers to build custom applications that extend Experience Cloud and run on Adobe infrastructure. The assessment is that App Builder is a suitable production home for the hidden layer, with composition moving to Adobe's InDesign API.

- **Decision logic moves as it is.** It is plain Node.js with no local dependencies, so it runs as serverless actions on Adobe I/O Runtime without a rewrite.
- **Events replace polling.** A Workfront event, such as a request reaching Ready to generate, or an AEM Assets event starts a run through I/O Events. The prototype's five-second poll disappears.
- **Composition leaves the desktop.** Actions call the InDesign API with the same job definitions the panel uses today. Runs are asynchronous, which suits Runtime: synchronous calls are limited to one minute, while background actions may run for hours.
- **Files travel by link, not through the service.** Runtime accepts small payloads only, so sources and outputs are exchanged as signed links between AEM Assets and the InDesign API, and fingerprints come from storage metadata.
- **Storage, workflow and audit belong to AEM and Workfront.** The release manifest becomes a Workfront record and an asset with metadata; the status folders become workflow states.
- **Small state stays small.** The last successful snapshot and processed requests sit in App Builder's State storage.
- **Operations come with the platform.** Developer Console handles credentials and provisioning, and the App Builder tooling handles deployment and logs, all within the organisation's Adobe agreement.

Conditions: App Builder and the InDesign API need enterprise entitlements in the organisation's Adobe Admin Console. Neither is available on the personal accounts used here, so this is a design conclusion rather than a tested one. The desktop panel remains a specialist fallback.

## What the proof does not establish

- Enterprise scale, availability and disaster recovery.
- Formal approval workflow, segregation of duties and immutable audit. Workfront would own these.
- Browser-based authoring. Content is edited in InDesign.
- PDF/UA conformance. Outputs are tagged and checked, not certified.
- Unattended composition. Adobe's InDesign API could not be tested on a personal account.

## How to read the result

- **Proceed to an enterprise proof** if InDesign-based editing, automatic where-used rebuilds and brand variants meet the need.
- **Narrow to templated composition** if maintaining a tagged content library proves too technical for business authors.
- **Reconsider a Keystone-class system** if browser authoring, fine-grained content verification or formal content-level evidence is essential.

## Beyond generation: triaging and drafting update requests

The prototype starts when a request is ready to generate. The problem statements tagged for triage and drafting sit earlier: briefs arrive incomplete and in several formats, without the metadata needed to plan the work, and production specialists end up interpreting content they do not own. The suggested extension puts two AI-enabled steps in front of the generation loop, both anchored in Workfront so that ownership, timing and approval stay visible.

- **Structured briefs.** Requests are submitted through a Workfront form that captures the documents affected, the change set, the effective date, the owner and any markups as attachments.
- **Triage.** An AI-enabled application checks each brief against the required structure and data, turns markups and spreadsheets into one structured change set, asks the requester for anything missing, and only then moves the request on. Nothing reaches a specialist half-described.
- **Drafting.** A second AI-enabled application applies the change set as a draft: it edits the affected stories, data values or templates within brand rules, makes the small design decisions a specialist would make, runs the prototype's validation and checks, and writes a plain summary of what it changed.
- **Review and approval.** The content owner reviews the draft release in Workfront. Approval raises the generation request that the existing loop already handles; rejection returns the draft with comments.
- **Specialist exception.** Layout changes the drafting step cannot make safely go to a designer, with the change set and draft attached.

| Stage | Owner | Problems addressed |
| --- | --- | --- |
| Structured brief | Requester, in Workfront | 14, 17, 19, 20 |
| Triage | AI-enabled application, a person on exceptions | 14, 15, 17 |
| Drafting | AI-enabled application, a designer on exceptions | 5, 15, 16, 17 |
| Review and approval | Content owner, in Workfront | 13, 20 |
| Inventory | Release manifests and Workfront records | 12 |

Problem numbers refer to `uc3-document-production-problem-statements.md`. The combined architecture is drawn in `adobe-prototype-triage-drafting-architecture.png`. This extension is a proposal: none of it is built, and it depends on the production platform above rather than on the prototype's desktop set-up.

## Where to look

- Recording steps: `adobe-prototype-demo-runsheet.md`
- Field and content decisions: `adobe-prototype-binding-worksheet.md`
- Architecture and boundaries: `adobe-keystone-alternative-prototype-plan.md`
- Triage and drafting architecture: `adobe-prototype-triage-drafting-architecture.png`
- Problem statements: `uc3-document-production-problem-statements.md`
- Code: private repository `forms-prototype`
