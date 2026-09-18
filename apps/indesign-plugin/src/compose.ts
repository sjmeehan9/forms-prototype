import { ColorModel, ColorSpace, FitOptions, FontStatus, LinkStatus, SaveOptions, app } from "indesign";
import {
  ResolvedDocumentBundleSchema,
  parseWithSchema,
  type ComponentBlock,
  type ComposeDocumentJob,
  type FormField,
  type Swatch,
  type UxpChecks,
  type UxpResult,
} from "@prototype/contracts";
import { exportInteractivePdf, exportPrintPdf, saveIndd } from "./export";
import { runPreflight } from "./preflight";
import { blocksToStoryText, completedResult, failedResult, hasCheckFailures, messageOf, paragraphStyleFor } from "./text-model";
import { ensureFolder, nativePathOf, readText, type Entry } from "./uxp-fs";

type Item = any;

const TARGET_LABEL_KEY = "prototype.target";

/** A template object is a target when it carries a `prototype.target` label or any plain script label. */
export function targetLabelOf(item: Item): string | null {
  try {
    const keyed = item.extractLabel(TARGET_LABEL_KEY);
    if (typeof keyed === "string" && keyed !== "") {
      return keyed;
    }
  } catch {
    // fall through to the plain label
  }
  const label = typeof item.label === "string" ? item.label.trim() : "";
  return label === "" ? null : label;
}

function indexTargets(doc: any): { targets: Map<string, Item>; duplicates: string[] } {
  const targets = new Map<string, Item>();
  const duplicates: string[] = [];
  for (const item of Array.from(doc.allPageItems ?? []) as Item[]) {
    const label = targetLabelOf(item);
    if (!label) {
      continue;
    }
    if (targets.has(label)) {
      duplicates.push(label);
    } else {
      targets.set(label, item);
    }
  }
  return { targets, duplicates };
}

function applySwatches(doc: any, swatches: Record<string, Swatch>): string[] {
  const notes: string[] = [];
  for (const [name, swatch] of Object.entries(swatches)) {
    let color = doc.colors.itemByName(name);
    if (!color || !color.isValid) {
      color = doc.colors.add({ name });
      notes.push(`created swatch ${name}`);
    }
    color.model = ColorModel.PROCESS;
    if (swatch.cmyk) {
      color.space = ColorSpace.CMYK;
      color.colorValue = swatch.cmyk;
    } else if (swatch.rgb) {
      color.space = ColorSpace.RGB;
      color.colorValue = swatch.rgb;
    }
  }
  return notes;
}

function applyText(doc: any, frame: Item, blocks: ComponentBlock[], styleMap: Record<string, string>): void {
  const story = frame.parentStory;
  story.contents = blocksToStoryText(blocks);
  const paragraphs: Item[] = story.paragraphs.everyItem().getElements();
  blocks.forEach((block, index) => {
    const styleName = paragraphStyleFor(block, styleMap);
    const paragraph = paragraphs[index];
    if (!styleName || !paragraph) {
      return;
    }
    const style = doc.paragraphStyles.itemByName(styleName);
    if (!style || !style.isValid) {
      throw new Error(`paragraph style "${styleName}" is not defined in the template`);
    }
    paragraph.appliedParagraphStyle = style;
  });
}

function applyAsset(item: Item, nativePath: string): void {
  item.place(nativePath);
  try {
    item.fit(FitOptions.PROPORTIONALLY);
    item.fit(FitOptions.CENTER_CONTENT);
  } catch {
    // Fit options are cosmetic; a failure here must not hide the placed asset.
  }
}

function applyFormFields(doc: any, fields: FormField[], targets: Map<string, Item>): string[] {
  const problems: string[] = [];
  const ordered: { order: number; control: Item }[] = [];
  for (const field of fields) {
    const control = targets.get(field.binding);
    if (!control) {
      problems.push(`form control ${field.binding} was not found in the template`);
      continue;
    }
    try {
      control.name = field.name;
      if (field.description !== undefined) {
        control.description = field.description;
      }
      if (field.required !== undefined) {
        control.required = field.required;
      }
      if (field.readOnly !== undefined) {
        control.readOnly = field.readOnly;
      }
      if (field.exportValue !== undefined && (field.type === "checkbox" || field.type === "radio")) {
        control.exportValue = field.exportValue;
      }
      if (field.options && (field.type === "combo" || field.type === "list")) {
        control.choiceList = field.options;
      }
    } catch (error) {
      problems.push(`could not configure form field ${field.name}: ${messageOf(error)}`);
    }
    if (field.tabOrder !== undefined) {
      ordered.push({ order: field.tabOrder, control });
    }
  }
  if (ordered.length > 0) {
    try {
      doc.tabOrder = ordered.sort((a, b) => a.order - b.order).map((entry) => entry.control);
    } catch (error) {
      problems.push(`could not set tab order: ${messageOf(error)}`);
    }
  }
  return problems;
}

function collectChecks(doc: any, notes: string[]): UxpChecks {
  const stories: Item[] = doc.stories.everyItem().getElements();
  const overset = stories.some((story) => story.overflows === true);
  const links: Item[] = doc.links.everyItem().getElements();
  const missingLinks = links.filter((link) => link.status !== LinkStatus.NORMAL).map((link) => String(link.name));
  const fonts: Item[] = doc.fonts.everyItem().getElements();
  const missingFonts = fonts.filter((font) => font.status !== FontStatus.INSTALLED).map((font) => String(font.name));
  const preflight = runPreflight(doc);
  notes.push(...preflight.notes);
  return { overset, missingLinks, missingFonts, preflightErrors: preflight.errors };
}

/** Open the template as a new document, populate labelled targets, check, then save/export beside the job. */
export async function composeDocument(root: Entry, job: ComposeDocumentJob): Promise<UxpResult> {
  const bundle = parseWithSchema(ResolvedDocumentBundleSchema, JSON.parse(await readText(root, job.bundle)), `bundle ${job.bundle}`);
  await ensureFolder(root, job.outputDir);
  const outputDirPath = nativePathOf(root, job.outputDir);
  const doc = app.open(nativePathOf(root, job.template));
  const notes: string[] = [];
  const outputs: string[] = [];
  try {
    const { targets, duplicates } = indexTargets(doc);
    if (duplicates.length > 0) {
      throw new Error(`duplicate target labels in the template: ${duplicates.join(", ")}`);
    }
    const missing = bundle.bindings.filter((binding) => !targets.has(binding.target)).map((binding) => binding.target);
    if (missing.length > 0) {
      throw new Error(`the template has no object labelled: ${missing.join(", ")}`);
    }
    notes.push(...applySwatches(doc, bundle.swatches));
    for (const binding of bundle.bindings) {
      const item = targets.get(binding.target);
      if (binding.kind === "text") {
        applyText(doc, item, binding.blocks, bundle.styleMap);
      } else if (binding.kind === "data") {
        applyText(doc, item, [{ type: "paragraph", text: binding.value }], {});
      } else {
        applyAsset(item, nativePathOf(root, binding.path));
      }
    }
    const fieldProblems = applyFormFields(doc, bundle.formFields, targets);
    if (fieldProblems.length > 0) {
      throw new Error(fieldProblems.join("; "));
    }
    const checks = collectChecks(doc, notes);
    if (hasCheckFailures(checks)) {
      return failedResult(job.jobId, "composition checks failed; see checks", checks, [], notes);
    }
    const base = `${outputDirPath}/${bundle.outputBaseName}`;
    if (bundle.output.saveIndd) {
      saveIndd(doc, `${base}.indd`);
      outputs.push(`${job.outputDir}/${bundle.outputBaseName}.indd`);
    }
    if (bundle.output.printPdf) {
      exportPrintPdf(doc, `${base}.pdf`);
      outputs.push(`${job.outputDir}/${bundle.outputBaseName}.pdf`);
    }
    if (bundle.output.interactivePdf) {
      exportInteractivePdf(doc, `${base}-interactive.pdf`);
      outputs.push(`${job.outputDir}/${bundle.outputBaseName}-interactive.pdf`);
    }
    return completedResult(job.jobId, outputs, checks, notes);
  } finally {
    try {
      doc.close(SaveOptions.NO);
    } catch {
      // The document may already be closed by a failed save; nothing else to do.
    }
  }
}
