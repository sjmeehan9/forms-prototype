import { LayoutSpecSchema, parseWithSchema, type BuildTemplateJob, type LayoutElement, type UxpResult } from "@prototype/contracts";
import {
  addFormControl,
  addTextFrame,
  applyStyleToAll,
  autoGrow,
  closeWithoutSaving,
  ensureParagraphStyle,
  ensureSwatch,
  geometricBounds,
  newDocument,
  paintItem,
  roundCorners,
  saveAndClose,
  type Doc,
  type Item,
} from "./indesign-helpers";
import { completedResult } from "./text-model";
import { readText, type Entry } from "./uxp-fs";

function drawElement(doc: Doc, page: Item, element: LayoutElement): void {
  if (element.kind === "shape") {
    if (element.shape === "line") {
      // A rule is drawn as a thin filled rectangle so its weight and colour are unambiguous.
      const weight = element.strokeWeight ?? 0.5;
      const horizontal = element.bounds.width >= element.bounds.height;
      const bounds = horizontal
        ? { ...element.bounds, top: element.bounds.top - weight / 2, height: weight }
        : { ...element.bounds, left: element.bounds.left - weight / 2, width: weight };
      const rule = page.rectangles.add({ geometricBounds: geometricBounds(bounds) });
      paintItem(doc, rule, { fill: element.stroke ?? element.fill });
      return;
    }
    const shape = element.shape === "oval" ? page.ovals.add({ geometricBounds: geometricBounds(element.bounds) }) : page.rectangles.add({ geometricBounds: geometricBounds(element.bounds) });
    paintItem(doc, shape, element);
    roundCorners(shape, element.cornerRadius);
    return;
  }
  if (element.kind === "text") {
    const frame = addTextFrame(page, element.bounds, element.text);
    applyStyleToAll(doc, frame, element.style);
    if (element.autoGrow !== false) {
      autoGrow(frame);
    }
    return;
  }
  if (element.kind === "target") {
    if (element.role === "asset") {
      const holder = page.rectangles.add({ geometricBounds: geometricBounds(element.bounds) });
      holder.label = element.label;
      paintItem(doc, holder, {});
      return;
    }
    const frame = addTextFrame(page, element.bounds, element.placeholder ?? `[${element.label}]`, element.label);
    applyStyleToAll(doc, frame, element.style);
    if (element.autoGrow !== false) {
      autoGrow(frame);
    }
    return;
  }
  const control = addFormControl(page, element.control, element.bounds);
  control.label = element.label;
  if (element.fill || element.stroke) {
    try {
      paintItem(doc, control, element);
    } catch {
      // Some control types keep their own state appearance; the default look is acceptable.
    }
  }
}

/** Render a layout spec into a controlled template: swatches, styles, then every element in paint order. */
export async function buildTemplate(root: Entry, job: BuildTemplateJob): Promise<UxpResult> {
  const layout = parseWithSchema(LayoutSpecSchema, JSON.parse(await readText(root, job.layout)), `layout ${job.layout}`);
  const notes: string[] = [];
  const doc = newDocument(layout.page.width, layout.page.height);
  let elements = 0;
  try {
    for (const [name, swatch] of Object.entries(layout.swatches)) {
      ensureSwatch(doc, name, swatch);
    }
    for (const [name, style] of Object.entries(layout.styles)) {
      ensureParagraphStyle(doc, name, style, notes);
    }
    const pages = [...layout.pages].sort((a, b) => a.number - b.number);
    pages.forEach((pageSpec, index) => {
      const page = index === 0 ? doc.pages.item(0) : doc.pages.add();
      for (const element of pageSpec.elements) {
        try {
          drawElement(doc, page, element);
          elements += 1;
        } catch (error) {
          const label = "label" in element ? element.label : element.kind;
          throw new Error(`page ${pageSpec.number}, ${element.kind} ${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });
  } catch (error) {
    closeWithoutSaving(doc);
    throw error;
  }
  await saveAndClose(doc, root, job.output, job.output.toLowerCase().endsWith(".indt"));
  notes.unshift(`built ${layout.documentId}: ${layout.pages.length} page(s), ${elements} element(s)`);
  return completedResult(job.jobId, [job.output], undefined, notes);
}
