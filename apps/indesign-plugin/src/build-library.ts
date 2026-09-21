import { ComponentRegisterSchema, parseWithSchema, type BuildLibraryJob, type ComponentRegister, type LayoutTextStyle, type UxpResult } from "@prototype/contracts";
import { A4, addTextFrame, applyParagraphStyles, closeWithoutSaving, ensureParagraphStyle, newDocument, saveAndClose, type Doc } from "./indesign-helpers";
import { completedResult } from "./text-model";
import { readText, type Entry } from "./uxp-fs";

const MARGIN = 40;

/** Appearance for a semantic style name in the business-readable library. */
export function libraryStyleFor(name: string): LayoutTextStyle {
  const lower = name.toLowerCase();
  if (lower.includes("heading")) {
    return { pointSize: 15, bold: true, spaceAfter: 6 };
  }
  if (lower.includes("list")) {
    return { pointSize: 10, bullets: true, indent: 14, spaceAfter: 4 };
  }
  if (lower.includes("strong")) {
    return { pointSize: 10, bold: true, spaceAfter: 6 };
  }
  if (lower.includes("note") || lower.includes("small")) {
    return { pointSize: 8.5, spaceAfter: 4 };
  }
  return { pointSize: 10, spaceAfter: 6 };
}

/** One page per reusable story: a caption, then a labelled frame whose paragraphs carry semantic styles. */
export function buildLibraryDocument(doc: Doc, register: ComponentRegister): void {
  const styleNames = new Set<string>(["body", "list-item"]);
  for (const component of register.components) {
    for (const block of component.blocks) {
      if (block.style) {
        styleNames.add(block.style);
      }
    }
  }
  for (const name of styleNames) {
    ensureParagraphStyle(doc, name, libraryStyleFor(name));
  }
  ensureParagraphStyle(doc, "caption", { pointSize: 8 });
  register.components.forEach((component, index) => {
    const page = index === 0 ? doc.pages.item(0) : doc.pages.add();
    const captionText = `Reusable component: ${component.id} (status ${component.status}${component.owner ? `, owner ${component.owner}` : ""})`;
    const caption = addTextFrame(page, { left: MARGIN, top: MARGIN, width: A4.width - 2 * MARGIN, height: 18 }, captionText);
    applyParagraphStyles(doc, caption, ["caption"]);
    const frame = addTextFrame(
      page,
      { left: MARGIN, top: MARGIN + 30, width: A4.width - 2 * MARGIN, height: A4.height - 2 * MARGIN - 30 },
      component.blocks.map((block) => block.text).join("\r"),
      `component:${component.id}`,
    );
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
    applyParagraphStyles(doc, frame, component.blocks.map((block) => block.style ?? (block.type === "list-item" ? "list-item" : "body")));
  });
}

export async function buildLibrary(root: Entry, job: BuildLibraryJob): Promise<UxpResult> {
  const register = parseWithSchema(ComponentRegisterSchema, JSON.parse(await readText(root, job.register)), "component register");
  const doc = newDocument();
  try {
    buildLibraryDocument(doc, register);
  } catch (error) {
    closeWithoutSaving(doc);
    throw error;
  }
  await saveAndClose(doc, root, job.output, false);
  return completedResult(job.jobId, [job.output], undefined, [`library built with ${register.components.length} component(s)`]);
}
