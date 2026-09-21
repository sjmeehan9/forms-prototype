#!/usr/bin/env node
/**
 * Render the step 17 binding worksheet (Markdown) from the ingestion maps, the shared field
 * dictionary and the content plan. Geometry and tab order come from the local inventories.
 * The worksheet carries no wording from the reference PDFs: only source field names and positions.
 *
 * Usage: node tools/pdf-inventory/worksheet.mjs <output.md>
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDictionaryEntry } from "./validate-maps.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const ingestDir = path.join(repoRoot, "fixtures", "demo-forms", "ingest");
const plan = JSON.parse(readFileSync(path.join(ingestDir, "content-plan.json"), "utf8"));
const maps = readdirSync(ingestDir).filter((f) => f.endsWith(".map.json")).sort().map((f) => JSON.parse(readFileSync(path.join(ingestDir, f), "utf8")));

const SOURCE_FILES = { consolidate: "81122_consolidate_your_super.pdf", choice: "super-choice-fund-nomination-form.pdf", details: "change-of-details-form.pdf" };

function boundsOf(map, inventory, field) {
  if (field.bounds) {
    return { ...field.bounds, page: map.pageMap[String(field.bounds.page)] ?? field.bounds.page };
  }
  const boxes = field.source.map((ref) => {
    const match = /^p(\d+)#(\d+) /.exec(ref);
    const page = Number(match[1]);
    const source = inventory.pages.find((p) => p.number === page).fields[Number(match[2]) - 1];
    return { page, left: source.left, top: source.top, right: source.left + source.width, bottom: source.top + source.height };
  });
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  return {
    page: map.pageMap[String(boxes[0].page)],
    left: Math.round(left * 10) / 10,
    top: Math.round(top * 10) / 10,
    width: Math.round((Math.max(...boxes.map((b) => b.right)) - left) * 10) / 10,
    height: Math.round((Math.max(...boxes.map((b) => b.bottom)) - top) * 10) / 10,
  };
}

function withTabOrder(map, inventory) {
  const placed = map.fields.map((field) => ({ field, box: boundsOf(map, inventory, field) }));
  placed.sort((a, b) => a.box.page - b.box.page || (Math.abs(a.box.top - b.box.top) <= 6 ? a.box.left - b.box.left : a.box.top - b.box.top));
  return placed.map((entry, index) => ({ ...entry, tabOrder: index + 1 }));
}

const lines = [];
const push = (...items) => lines.push(...items);

push("# Adobe prototype: step 17 binding worksheet", "");
push(`**Rendered:** ${new Date().toISOString().slice(0, 10)} from \`fixtures/demo-forms/ingest/\` in the application repository. Edit those files, not this document, then re-render.`, "");
push("## Approach", "");
push("- The three PDFs are measured references only. Their form fields and text positions were inventoried locally; the inventories hold the original wording and stay out of git, Frame.io and Creative Cloud.");
push("- Every image, logo and piece of copy is replaced. Layout, section structure and control positions follow the references, so each template keeps its own look.");
push("- Fund facts become governed product data. Two synthetic brands apply to all three documents, giving six outputs.");
push("- One shared field dictionary names every control, replacing the three naming schemes found in the references.", "");

push("## Documents", "");
push("| Document id | Title | Modelled on | Archetype | Pages | Source fields | Controls |", "| --- | --- | --- | --- | --- | --- | --- |");
const placedByDoc = new Map();
for (const map of maps) {
  const inventory = JSON.parse(readFileSync(path.join(repoRoot, ".prototype", "ingest", map.source.slug, "inventory.json"), "utf8"));
  const placed = withTabOrder(map, inventory);
  placedByDoc.set(map.documentId, placed);
  const sourceTotal = inventory.pages.reduce((sum, page) => sum + page.fields.length, 0);
  push(`| \`${map.documentId}\` | ${map.title} | \`${SOURCE_FILES[map.source.slug]}\` | ${map.archetype} | ${Object.keys(map.pageMap).length} | ${sourceTotal} | ${map.fields.length} |`);
}
push("");

push("## Brands", "");
push("| Brand id | Name | Role |", "| --- | --- | --- |");
for (const brand of plan.brands) {
  push(`| \`${brand.id}\` | ${brand.name} | ${brand.role} |`);
}
push("");

const docIds = maps.map((m) => m.documentId);
const usedBy = (kind, key, field) => docIds.map((id) => (maps.find((m) => m.documentId === id)[kind].some((entry) => entry[field] === key) ? "yes" : ""));

push("## Reusable components and where they are used", "");
push(`| Component | Purpose | Shape | ${docIds.join(" | ")} |`, `| --- | --- | --- | ${docIds.map(() => "---").join(" | ")} |`);
const componentRows = Object.entries(plan.components).map(([id, info]) => ({ id, info, used: usedBy("content", id, "component") }));
componentRows.sort((a, b) => b.used.filter(Boolean).length - a.used.filter(Boolean).length || a.id.localeCompare(b.id));
for (const row of componentRows) {
  push(`| \`${row.id}\` | ${row.info.purpose} | ${row.info.shape} | ${row.used.join(" | ")} |`);
}
push("");

push("## Governed data and where it is used", "");
push(`| Data key | Type | Scope | Purpose | ${docIds.join(" | ")} |`, `| --- | --- | --- | --- | ${docIds.map(() => "---").join(" | ")} |`);
for (const [key, info] of Object.entries(plan.data)) {
  push(`| \`${key}\` | ${info.type} | ${info.scope} | ${info.purpose} | ${usedBy("data", key, "key").join(" | ")} |`);
}
push("", "Scope `brand` means the primary brand's value sits in the product data file and the second brand overrides it in its brand pack. Scope `shared` means one value serves both brands.", "");

push("## Assets", "");
push(`| Asset | Scope | Purpose | ${docIds.join(" | ")} |`, `| --- | --- | --- | ${docIds.map(() => "---").join(" | ")} |`);
for (const [id, info] of Object.entries(plan.assets)) {
  push(`| \`${id}\` | ${info.scope} | ${info.purpose} | ${usedBy("assets", id, "id").join(" | ")} |`);
}
push("");

push("## Normalisation decisions", "");
push("- **Title** becomes one combo box from the dictionary in all three forms, replacing rows of tick boxes, radio buttons and a free-text box.");
push("- **Dates** split into day, month and year boxes become single date fields with a format hint.");
push("- **Exclusive choices** built from tick boxes become radio groups: gender, transfer amount, payment amount, payment frequency and card colour.");
push("- **Gender** gains a third option, so three radio buttons appear where the references had two.");
push("- **Signatures** become real signature fields; the references left blank boxes.");
push("- **Character boxes** (comb fields) become plain fields that keep their maximum length. Comb formatting is an Acrobat property and is recorded as a finishing rule.");
push("- **The fund's own identifiers** are printed from governed data instead of being pre-printed or typed by the member.");
push("- **Inline facts inside sentences** are avoided: components never embed a fund name or number, so a component stays brand-neutral and facts sit in data targets.");
push("- **Dropped:** two scripted buttons and one intentionally blank page.", "");

push("## Demo scenarios this set supports", "");
push("| Change | Expected rebuild |", "| --- | --- |");
push("| Edit `privacy.statement` in the content library | All six outputs |");
push("| Edit `tfn.notice` | Four outputs; both `fund-nomination` outputs are skipped |");
push("| Change shared `contact.hours` in the product data | Four outputs; `fund-nomination` skipped |");
push("| Change `fund.spin` for the primary brand | One output: `fund-nomination` for that brand |");
push("| Replace the second brand's logo | Three outputs, all for that brand |");
push("| Restyle the `fund-nomination` template | Two outputs |");
push("| Reference a draft component or an expired data value | Visible failure before InDesign is asked to compose |", "");

for (const map of maps) {
  const placed = placedByDoc.get(map.documentId);
  push(`## Fields: ${map.documentId}`, "");
  push("| Tab | Page | Semantic name | Control | Req | Max | Description (tooltip) | Source |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const { field, box, tabOrder } of placed) {
    const entry = resolveDictionaryEntry(field.name);
    const option = field.type === "radio" ? `radio: ${entry.options[field.exportValue]}` : field.type === "combo" ? `combo (${entry.options.length} options)` : field.type;
    const source = field.source.length === 0 ? "added" : field.source.map((ref) => ref.replace(/ /, " `") + "`").join(", ");
    push(`| ${tabOrder} | ${box.page} | \`${field.name}\` | ${option} | ${field.required ? "yes" : ""} | ${field.maxLength ?? ""} | ${entry.description} | ${source} |`);
  }
  push("");
  if (map.dropped.length > 0) {
    push("Dropped from the reference:", "");
    for (const drop of map.dropped) {
      push(`- ${(drop.source ?? [`source page ${drop.sourcePage}`]).join(", ")}: ${drop.reason}`);
    }
    push("");
  }
}

push("## Limits to record", "");
push("- Comb formatting, date validation and any calculation are Acrobat finishing rules, not InDesign output.");
push("- Templates are generated from measured positions; decorative shapes are approximated, not traced.");
push("- The references' fonts are not used. Templates use installed fonts so preflight stays clean.", "");

push("## Approval", "");
push("- [ ] Document ids, titles and archetype mapping");
push("- [ ] Two brands applied to all three documents");
push("- [ ] Component list and where-used matrix");
push("- [ ] Data keys and scopes");
push("- [ ] Normalisation decisions, including the combo title and single date fields");
push("- [ ] Field names, required flags and tab order per document", "");

const output = process.argv[2];
if (!output) {
  console.error("usage: worksheet.mjs <output.md>");
  process.exit(2);
}
writeFileSync(path.resolve(output), `${lines.join("\n")}\n`);
console.log(`worksheet written to ${output} (${lines.length} lines)`);
