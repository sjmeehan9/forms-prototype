import { AutoSizingReferenceEnum, AutoSizingTypeEnum, ColorModel, ColorSpace, ListType, MeasurementUnits, SaveOptions, app } from "indesign";
import {
  BrandPackSchema,
  ComponentRegisterSchema,
  DocumentManifestSchema,
  parseWithSchema,
  type BrandPack,
  type ComponentRegister,
  type CreateSamplesJob,
  type DocumentManifest,
  type FormField,
  type UxpResult,
} from "@prototype/contracts";
import { completedResult } from "./text-model";
import { ensureFolder, getEntry, listJsonFiles, nativePathOf, readEntryText, readText, segments, type Entry } from "./uxp-fs";

type Doc = any;
type Item = any;
type Bounds = [number, number, number, number];

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;

function newDocument(): Doc {
  const doc = app.documents.add();
  try {
    doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
    doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
  } catch {
    // Units default to the application preference; geometry below is in points either way.
  }
  try {
    doc.documentPreferences.facingPages = false;
    doc.documentPreferences.pageWidth = PAGE_WIDTH;
    doc.documentPreferences.pageHeight = PAGE_HEIGHT;
  } catch {
    // Keep the default page size when the preference is read-only on this host.
  }
  return doc;
}

type StyleSpec = { pointSize: number; bold?: boolean; bullets?: boolean; indent?: number };

function styleSpecFor(name: string): StyleSpec {
  const lower = name.toLowerCase();
  if (lower.includes("heading 1")) {
    return { pointSize: 20, bold: true };
  }
  if (lower.includes("heading")) {
    return { pointSize: 15, bold: true };
  }
  if (lower.includes("bullet 2") || lower.endsWith(".2")) {
    return { pointSize: 10, bullets: true, indent: 28 };
  }
  if (lower.includes("bullet") || lower.includes("list")) {
    return { pointSize: 10, bullets: true };
  }
  return { pointSize: 10 };
}

function ensureParagraphStyle(doc: Doc, name: string, spec: StyleSpec): Item {
  let style = doc.paragraphStyles.itemByName(name);
  if (!style || !style.isValid) {
    style = doc.paragraphStyles.add({ name });
  }
  style.pointSize = spec.pointSize;
  style.leading = Math.round(spec.pointSize * 1.3);
  style.spaceAfter = 6;
  if (spec.bold) {
    try {
      style.fontStyle = "Bold";
    } catch {
      // The default font may lack a Bold face; size still distinguishes headings.
    }
  }
  if (spec.bullets) {
    try {
      style.bulletsAndNumberingListType = ListType.BULLET_LIST;
      style.leftIndent = spec.indent ?? 14;
      style.firstLineIndent = -(spec.indent ?? 14);
    } catch {
      // Bullets are cosmetic for the sample; extraction also falls back to the style name.
    }
  }
  return style;
}

function ensureColor(doc: Doc, name: string, cmyk: number[]): Item {
  let color = doc.colors.itemByName(name);
  if (!color || !color.isValid) {
    color = doc.colors.add({ name });
  }
  color.model = ColorModel.PROCESS;
  color.space = ColorSpace.CMYK;
  color.colorValue = cmyk;
  return color;
}

function addTextFrame(page: Item, bounds: Bounds, contents?: string, label?: string): Item {
  const frame = page.textFrames.add({ geometricBounds: bounds });
  if (label) {
    frame.label = label;
  }
  if (contents !== undefined) {
    frame.contents = contents;
  }
  return frame;
}

function autoGrow(frame: Item): void {
  try {
    frame.textFramePreferences.autoSizingReferencePoint = AutoSizingReferenceEnum.TOP_CENTER_POINT;
    frame.textFramePreferences.autoSizingType = AutoSizingTypeEnum.HEIGHT_ONLY;
  } catch {
    // Without auto-sizing the generous frame heights still hold the fixture content.
  }
}

function applyParagraphStyles(doc: Doc, frame: Item, styleNames: (string | undefined)[]): void {
  const paragraphs: Item[] = frame.parentStory.paragraphs.everyItem().getElements();
  styleNames.forEach((name, index) => {
    const paragraph = paragraphs[index];
    if (!name || !paragraph) {
      return;
    }
    const style = doc.paragraphStyles.itemByName(name);
    if (style && style.isValid) {
      paragraph.appliedParagraphStyle = style;
    }
  });
}

async function saveAndClose(doc: Doc, root: Entry, jobPath: string, asTemplate: boolean): Promise<void> {
  const parts = segments(jobPath);
  parts.pop();
  await ensureFolder(root, parts.join("/"));
  const existing = await getEntry(root, jobPath);
  if (existing && existing.isFile) {
    await existing.delete();
  }
  const nativePath = nativePathOf(root, jobPath);
  if (asTemplate) {
    doc.save(nativePath, true);
  } else {
    doc.save(nativePath);
  }
  doc.close(SaveOptions.NO);
}

/** One page per reusable story: a caption plus a labelled frame whose paragraphs carry semantic styles. */
function buildLibrary(doc: Doc, register: ComponentRegister): void {
  ensureParagraphStyle(doc, "heading", { pointSize: 15, bold: true });
  ensureParagraphStyle(doc, "body", { pointSize: 10 });
  ensureParagraphStyle(doc, "list-item", { pointSize: 10, bullets: true });
  ensureParagraphStyle(doc, "caption", { pointSize: 8 });
  register.components.forEach((component, index) => {
    const page = index === 0 ? doc.pages.item(0) : doc.pages.add();
    const captionText = `Reusable component: ${component.id} (status ${component.status}${component.owner ? `, owner ${component.owner}` : ""})`;
    const caption = addTextFrame(page, [MARGIN, MARGIN, MARGIN + 18, PAGE_WIDTH - MARGIN], captionText);
    applyParagraphStyles(doc, caption, ["caption"]);
    const frame = addTextFrame(page, [MARGIN + 30, MARGIN, PAGE_HEIGHT - MARGIN, PAGE_WIDTH - MARGIN], component.blocks.map((block) => block.text).join("\r"), `component:${component.id}`);
    frame.insertLabel("prototype.componentId", component.id);
    frame.insertLabel("prototype.status", component.status);
    if (component.owner) {
      frame.insertLabel("prototype.owner", component.owner);
    }
    if (component.effectiveFrom) {
      frame.insertLabel("prototype.effectiveFrom", component.effectiveFrom);
    }
    if (component.effectiveTo) {
      frame.insertLabel("prototype.effectiveTo", component.effectiveTo);
    }
    applyParagraphStyles(doc, frame, component.blocks.map((block) => (block.type === "list-item" ? "list-item" : (block.style ?? "body"))));
  });
}

function addFormControl(page: Item, field: FormField, bounds: Bounds): { control: Item; height: number } {
  const [y1, x1, , x2] = bounds;
  const small: Bounds = [y1, x1, y1 + 14, x1 + 14];
  switch (field.type) {
    case "checkbox":
      return { control: page.checkBoxes.add({ geometricBounds: small }), height: 24 };
    case "radio":
      return { control: page.radioButtons.add({ geometricBounds: small }), height: 24 };
    case "combo":
      return { control: page.comboBoxes.add({ geometricBounds: bounds }), height: 32 };
    case "list":
      return { control: page.listBoxes.add({ geometricBounds: [y1, x1, y1 + 60, x2] }), height: 70 };
    case "button":
      return { control: page.buttons.add({ geometricBounds: [y1, x1, y1 + 22, x1 + 120] }), height: 32 };
    case "signature":
      return { control: page.signatureFields.add({ geometricBounds: [y1, x1, y1 + 40, x2] }), height: 50 };
    default:
      return { control: page.textBoxes.add({ geometricBounds: bounds }), height: 32 };
  }
}

/** A controlled template: brand bar, logo target, one labelled object per binding, and labelled form controls. */
function buildTemplate(doc: Doc, manifest: DocumentManifest, brand: BrandPack | undefined): void {
  const styleNames = [...new Set(Object.values(manifest.styleMap ?? {}))];
  for (const styleName of styleNames) {
    ensureParagraphStyle(doc, styleName, styleSpecFor(styleName));
  }
  ensureParagraphStyle(doc, "Field Label", { pointSize: 9 });
  ensureParagraphStyle(doc, "Data", { pointSize: 11, bold: true });
  const swatchNames = Object.keys(brand?.swatches ?? {});
  if (swatchNames.length === 0) {
    swatchNames.push("brand.primary", "brand.accent");
  }
  for (const name of swatchNames) {
    ensureColor(doc, name, [0, 0, 0, 60]);
  }

  let page = doc.pages.item(0);
  const bar = page.rectangles.add({ geometricBounds: [0, 0, 56, PAGE_WIDTH] });
  try {
    bar.fillColor = doc.colors.itemByName(swatchNames[0]);
    bar.strokeColor = doc.swatches.itemByName("None");
  } catch {
    // The bar is decoration only.
  }
  let y = 80;
  const ensureRoom = (needed: number): void => {
    if (y + needed > PAGE_HEIGHT - MARGIN) {
      page = doc.pages.add();
      y = MARGIN;
    }
  };

  for (const binding of manifest.bindings) {
    const source = binding.source;
    if (source.type === "asset") {
      if (source.id === "brand.logo") {
        const logo = page.rectangles.add({ geometricBounds: [8, PAGE_WIDTH - 150, 48, PAGE_WIDTH - 10] });
        logo.label = binding.target;
        try {
          logo.strokeColor = doc.swatches.itemByName("None");
        } catch {
          // Stroke is cosmetic.
        }
        continue;
      }
      ensureRoom(110);
      const rect = page.rectangles.add({ geometricBounds: [y, MARGIN, y + 100, PAGE_WIDTH - MARGIN] });
      rect.label = binding.target;
      y += 110;
    } else if (source.type === "data") {
      ensureRoom(30);
      const frame = addTextFrame(page, [y, MARGIN, y + 22, PAGE_WIDTH - MARGIN], `[${source.key}]`, binding.target);
      applyParagraphStyles(doc, frame, ["Data"]);
      y += 30;
    } else {
      const height = manifest.archetype === "long-guide" ? 200 : 150;
      ensureRoom(height + 10);
      const frame = addTextFrame(page, [y, MARGIN, y + height, PAGE_WIDTH - MARGIN], `[${source.id}]`, binding.target);
      autoGrow(frame);
      y += height + 10;
    }
  }

  const fields = manifest.formFields ?? [];
  if (fields.length > 0) {
    ensureRoom(40);
    const heading = addTextFrame(page, [y, MARGIN, y + 24, PAGE_WIDTH - MARGIN], "Your details");
    applyParagraphStyles(doc, heading, [styleNames.find((name) => name.toLowerCase().includes("heading"))]);
    y += 32;
  }
  for (const field of fields) {
    ensureRoom(60);
    const label = addTextFrame(page, [y, MARGIN, y + 24, 220], field.description ?? field.name);
    applyParagraphStyles(doc, label, ["Field Label"]);
    const { control, height } = addFormControl(page, field, [y, 230, y + 22, PAGE_WIDTH - MARGIN]);
    control.label = field.binding;
    y += height + 6;
  }
}

/** Build the sample library and one template per manifest, saving them where the job points. */
export async function createSamples(root: Entry, job: CreateSamplesJob): Promise<UxpResult> {
  const register = parseWithSchema(ComponentRegisterSchema, JSON.parse(await readText(root, job.register)), "component register");
  const manifestFolder = await getEntry(root, job.manifestDir);
  if (!manifestFolder || !manifestFolder.isFolder) {
    throw new Error(`manifest folder not found: ${job.manifestDir}`);
  }
  const manifests: DocumentManifest[] = [];
  for (const file of await listJsonFiles(manifestFolder)) {
    manifests.push(parseWithSchema(DocumentManifestSchema, JSON.parse(await readEntryText(file)), String(file.name)));
  }
  const brands: BrandPack[] = [];
  const brandFolder = await getEntry(root, job.brandDir);
  if (brandFolder && brandFolder.isFolder) {
    for (const entry of (await brandFolder.getEntries()) as Entry[]) {
      if (!entry.isFolder) {
        continue;
      }
      for (const pack of ((await entry.getEntries()) as Entry[]).filter((e) => e.isFile && e.name === "brand.json")) {
        brands.push(parseWithSchema(BrandPackSchema, JSON.parse(await readEntryText(pack)), `${entry.name}/brand.json`));
      }
    }
  }

  const outputs: string[] = [];
  const libraryDoc = newDocument();
  try {
    buildLibrary(libraryDoc, register);
  } catch (error) {
    libraryDoc.close(SaveOptions.NO);
    throw error;
  }
  await saveAndClose(libraryDoc, root, job.libraryOutput, false);
  outputs.push(job.libraryOutput);

  await ensureFolder(root, job.templateOutputDir);
  for (const manifest of manifests) {
    const doc = newDocument();
    try {
      buildTemplate(doc, manifest, brands[0]);
    } catch (error) {
      doc.close(SaveOptions.NO);
      throw error;
    }
    const output = `${job.templateOutputDir}/${manifest.templateId}`;
    await saveAndClose(doc, root, output, manifest.templateId.toLowerCase().endsWith(".indt"));
    outputs.push(output);
  }
  return completedResult(job.jobId, outputs, undefined, [`created ${register.components.length} components and ${manifests.length} templates`]);
}
