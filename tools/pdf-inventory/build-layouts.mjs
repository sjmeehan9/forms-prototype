#!/usr/bin/env node
/**
 * Generate layout specs and document manifests for the demo forms.
 *
 * Inputs: ingestion maps and the field dictionary (committed), hand-authored designs (committed, synthetic
 * wording and measured numbers only) and the local inventories (.prototype/ingest, never committed).
 * Outputs: fixtures/demo-forms/layouts/<doc>.layout.json and the store's document manifests.
 * The outputs carry resolved numbers, so they can be rebuilt into templates without the reference PDFs.
 *
 * Usage: node tools/pdf-inventory/build-layouts.mjs [documentId ...]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveDictionaryEntry } from "./validate-maps.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const demoDir = path.join(repoRoot, "fixtures", "demo-forms");
const ingestDir = path.join(demoDir, "ingest");
const plan = JSON.parse(readFileSync(path.join(ingestDir, "content-plan.json"), "utf8"));
const round1 = (value) => Math.round(value * 10) / 10;

/** Helpers handed to a design so it reads like a drawing list. */
const helpers = {
  rect: (left, top, width, height, paint = {}) => ({ kind: "shape", shape: "rectangle", bounds: { left, top, width, height }, ...paint }),
  oval: (left, top, width, height, paint = {}) => ({ kind: "shape", shape: "oval", bounds: { left, top, width, height }, ...paint }),
  rule: (left, top, width, paint = {}) => ({ kind: "shape", shape: "line", bounds: { left, top, width, height: 0 }, ...paint }),
  text: (left, top, width, height, text, style, options = {}) => ({ kind: "text", bounds: { left, top, width, height }, text, style, ...options }),
  content: (componentId, left, top, width, height, style, slot) => ({ kind: "target", role: "content", label: `content:${componentId}${slot ? `@${slot}` : ""}`, bounds: { left, top, width, height }, style, placeholder: `[${componentId}]` }),
  data: (key, left, top, width, height, style, slot, options = {}) => ({ kind: "target", role: "data", label: `data:${key}${slot ? `@${slot}` : ""}`, bounds: { left, top, width, height }, style, placeholder: `[${key}]`, ...options }),
  asset: (id, left, top, width, height, slot) => ({ kind: "target", role: "asset", label: `asset:${id}${slot ? `@${slot}` : ""}`, bounds: { left, top, width, height } }),
};

function sourceBoxes(map, inventory, field) {
  return field.source.map((ref) => {
    const match = /^p(\d+)#(\d+) /.exec(ref);
    const page = Number(match[1]);
    const source = inventory.pages.find((p) => p.number === page).fields[Number(match[2]) - 1];
    return { page, source };
  });
}

function placeField(map, inventory, field) {
  const sources = sourceBoxes(map, inventory, field);
  if (field.bounds) {
    const { page, ...bounds } = field.bounds;
    return { page: map.pageMap[String(page)] ?? page, bounds, first: sources[0]?.source ?? null };
  }
  const left = Math.min(...sources.map((s) => s.source.left));
  const top = Math.min(...sources.map((s) => s.source.top));
  const right = Math.max(...sources.map((s) => s.source.left + s.source.width));
  const bottom = Math.max(...sources.map((s) => s.source.top + s.source.height));
  return {
    page: map.pageMap[String(sources[0].page)],
    bounds: { left: round1(left), top: round1(top), width: round1(right - left), height: round1(bottom - top) },
    first: sources[0].source,
  };
}

function estimateWidth(text, pointSize) {
  return round1(text.length * pointSize * 0.55 + 8);
}

export function controlLabel(field) {
  return `field:${field.name}${field.type === "radio" ? `:${field.exportValue}` : ""}`;
}

function buildDocument(map, design, inventory) {
  const placed = map.fields.map((field) => ({ field, ...placeField(map, inventory, field), entry: resolveDictionaryEntry(field.name) }));
  placed.sort((a, b) => a.page - b.page || (Math.abs(a.bounds.top - b.bounds.top) <= 6 ? a.bounds.left - b.bounds.left : a.bounds.top - b.bounds.top));
  placed.forEach((item, index) => {
    item.tabOrder = index + 1;
  });

  const pageNumbers = [...new Set([...Object.values(map.pageMap), ...Object.keys(design.pages).map(Number)])].sort((a, b) => a - b);
  const labelSize = design.styles[design.labelStyle].pointSize;
  const groupsLabelled = new Set();
  const pages = pageNumbers.map((number) => {
    const elements = [...(design.pages[number] ?? [])];
    const labels = [];
    const controls = [];
    const fieldBoxes = [];
    for (const item of placed.filter((p) => p.page === number)) {
      const { field, bounds, first, entry } = item;
      const override = design.labelOverrides?.[controlLabel(field).slice("field:".length)] ?? design.labelOverrides?.[field.name] ?? {};
      const required = field.required ? " *" : "";
      const boxes = first?.labelBoxes ?? { above: null, left: null, right: null };
      const isChoice = field.type === "radio" || field.type === "checkbox";
      if (isChoice) {
        const optionText = override.text ?? (field.type === "radio" ? entry.options[field.exportValue] : entry.label);
        const at = boxes.right ?? { left: bounds.left + bounds.width + 5, top: bounds.top + (bounds.height - labelSize) / 2 - 1, height: labelSize + 2 };
        if (!override.hidden) {
          labels.push(helpers.text(override.left ?? at.left, override.top ?? at.top, override.width ?? estimateWidth(optionText, labelSize), override.height ?? at.height + 2, optionText, override.style ?? design.optionStyle));
        }
        if (field.type === "radio" && !groupsLabelled.has(field.name)) {
          groupsLabelled.add(field.name);
          const group = design.groupLabels?.[field.name] ?? {};
          const anchor = boxes.above ?? boxes.left;
          if (!group.hidden && (anchor || group.left !== undefined)) {
            const groupText = group.text ?? `${entry.label}${required}`;
            labels.push(helpers.text(group.left ?? anchor.left, group.top ?? anchor.top, group.width ?? estimateWidth(groupText, labelSize), (anchor?.height ?? labelSize) + 2, groupText, group.style ?? design.labelStyle));
          }
        }
      } else if (!override.hidden) {
        const labelText = override.text ?? `${entry.label}${entry.hint && design.showHints ? ` (${entry.hint})` : ""}${required}`;
        const preferred = design.labelPlacement === "left" ? (boxes.left ?? boxes.above) : (boxes.above ?? boxes.left);
        const fallback = design.labelPlacement === "left" ? { left: design.labelColumnLeft ?? 50, top: bounds.top + 4, height: labelSize + 2 } : { left: bounds.left, top: bounds.top - labelSize - 3.5, height: labelSize + 2 };
        const at = preferred ?? fallback;
        // A label counts as beside its field only when it sits clearly to the left and on the field's own row.
        const labelCentre = at.top + at.height / 2;
        const besideField = at.left + 15 < bounds.left && labelCentre > bounds.top && labelCentre < bounds.top + bounds.height;
        const room = besideField ? Math.max(30, bounds.left - at.left - 6) : Infinity;
        labels.push(helpers.text(override.left ?? at.left, override.top ?? at.top, override.width ?? Math.min(estimateWidth(labelText, labelSize), room), override.height ?? at.height + 2, labelText, override.style ?? design.labelStyle));
      }
      if (design.fieldBox) {
        // Controls are not drawn in the print PDF and tick boxes have no resting appearance, so draw the box itself.
        const round = field.type === "radio" && design.fieldBox.radioShape === "oval";
        fieldBoxes.push({ kind: "shape", shape: round ? "oval" : "rectangle", bounds, fill: design.fieldBox.fill, stroke: design.fieldBox.stroke, strokeWeight: design.fieldBox.strokeWeight, ...(round || !design.fieldBox.cornerRadius ? {} : { cornerRadius: design.fieldBox.cornerRadius }) });
      }
      controls.push({ kind: "control", control: field.type, label: controlLabel(field), bounds, ...(design.controlPaint ?? {}) });
    }
    return { number, elements: [...elements, ...fieldBoxes, ...labels, ...controls] };
  });

  const layout = {
    schemaVersion: 1,
    documentId: map.documentId,
    templateId: map.templateId,
    page: design.page ?? { width: 595.28, height: 841.89 },
    swatches: design.swatches,
    styles: design.styles,
    pages,
  };

  const bindings = [];
  const seenTargets = new Set();
  for (const page of pages) {
    for (const element of page.elements) {
      if (element.kind !== "target" || seenTargets.has(element.label)) continue;
      seenTargets.add(element.label);
      const [role, rest] = [element.label.slice(0, element.label.indexOf(":")), element.label.slice(element.label.indexOf(":") + 1)];
      const id = rest.split("@")[0];
      const source = role === "content" ? { type: "component", id } : role === "data" ? { type: "data", key: id } : { type: "asset", id };
      bindings.push({ target: element.label, source });
    }
  }
  const formFields = placed.map(({ field, entry, tabOrder }) => ({
    name: field.name,
    type: field.type,
    binding: controlLabel(field),
    description: field.type === "radio" ? `${entry.description}: ${entry.options[field.exportValue]}` : entry.description,
    ...(field.required ? { required: true } : {}),
    ...(field.type === "radio" ? { exportValue: field.exportValue, group: field.name } : {}),
    ...(field.type === "checkbox" ? { exportValue: field.exportValue ?? "Yes" } : {}),
    ...(field.type === "combo" ? { options: entry.options } : {}),
    tabOrder,
  }));
  const manifest = {
    schemaVersion: 1,
    id: map.documentId,
    archetype: map.archetype,
    templateId: map.templateId,
    brandIds: plan.brands.map((brand) => brand.id),
    bindings,
    styleMap: design.componentStyles,
    formFields,
    output: design.output,
  };
  return { layout, manifest };
}

async function main() {
  const wanted = process.argv.slice(2);
  const maps = readdirSync(ingestDir).filter((f) => f.endsWith(".map.json")).sort().map((f) => JSON.parse(readFileSync(path.join(ingestDir, f), "utf8")));
  const layoutsDir = path.join(demoDir, "layouts");
  const manifestsDir = path.join(demoDir, "store", "02 Templates and assets", "document-manifests");
  mkdirSync(layoutsDir, { recursive: true });
  mkdirSync(manifestsDir, { recursive: true });
  for (const map of maps) {
    if (wanted.length > 0 && !wanted.includes(map.documentId)) continue;
    const designFile = path.join(demoDir, "designs", `${map.documentId}.design.mjs`);
    if (!existsSync(designFile)) {
      console.log(`${map.documentId}: no design yet, skipped`);
      continue;
    }
    const inventoryFile = path.join(repoRoot, ".prototype", "ingest", map.source.slug, "inventory.json");
    if (!existsSync(inventoryFile)) {
      throw new Error(`${map.documentId}: ${inventoryFile} is missing; run npm run ingest:inventory first`);
    }
    const design = (await import(pathToFileURL(designFile).href)).default(helpers);
    const { layout, manifest } = buildDocument(map, design, JSON.parse(readFileSync(inventoryFile, "utf8")));
    writeFileSync(path.join(layoutsDir, `${map.documentId}.layout.json`), `${JSON.stringify(layout, null, 2)}\n`);
    writeFileSync(path.join(manifestsDir, `${map.documentId}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
    const elementCount = layout.pages.reduce((sum, page) => sum + page.elements.length, 0);
    console.log(`${map.documentId}: ${layout.pages.length} page(s), ${elementCount} elements, ${manifest.bindings.length} bindings, ${manifest.formFields.length} form fields`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
