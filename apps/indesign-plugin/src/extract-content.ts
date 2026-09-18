import { ListType, SaveOptions, app } from "indesign";
import type { ComponentBlock, ExtractContentJob, UxpResult } from "@prototype/contracts";
import { completedResult, enumEquals } from "./text-model";
import { ensureFolder, nativePathOf, segments, writeTextAtomic, type Entry } from "./uxp-fs";

type Item = any;

const COMPONENT_LABEL_KEY = "prototype.componentId";
const COMPONENT_LABEL_PREFIX = "component:";

function labelValue(item: Item, key: string): string | undefined {
  try {
    const value = item.extractLabel(key);
    return typeof value === "string" && value !== "" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** A text frame is a component when it carries a `prototype.componentId` label or a `component:<id>` label. */
export function componentIdOf(item: Item): string | null {
  const keyed = labelValue(item, COMPONENT_LABEL_KEY);
  if (keyed) {
    return keyed;
  }
  const label = typeof item.label === "string" ? item.label.trim() : "";
  return label.startsWith(COMPONENT_LABEL_PREFIX) ? label.slice(COMPONENT_LABEL_PREFIX.length) : null;
}

function isTextFrame(item: Item): boolean {
  try {
    return (item.constructor && item.constructor.name === "TextFrame") || typeof item.parentStory === "object";
  } catch {
    return false;
  }
}

export function paragraphsToBlocks(paragraphs: Item[]): ComponentBlock[] {
  const blocks: ComponentBlock[] = [];
  for (const paragraph of paragraphs) {
    const raw = typeof paragraph.contents === "string" ? paragraph.contents : "";
    const text = raw.replace(/[\r\n\u2029]+$/g, "").trim();
    if (!text) {
      continue;
    }
    let style: string | undefined;
    try {
      style = paragraph.appliedParagraphStyle?.name;
    } catch {
      style = undefined;
    }
    let isList = /list/i.test(style ?? "");
    let level = 1;
    try {
      const listType = paragraph.bulletsAndNumberingListType;
      if (listType !== undefined && listType !== null) {
        isList = isList || !enumEquals(listType, ListType.NO_LIST);
      }
      level = Number(paragraph.numberingLevel) || 1;
    } catch {
      // Keep the style-name fallback when the list properties are unavailable.
    }
    blocks.push(isList ? { type: "list-item", text, level, style } : { type: "paragraph", text, style });
  }
  return blocks;
}

/** Open the content library read-only, collect labelled stories, write the register, close without saving. */
export async function extractContent(root: Entry, job: ExtractContentJob): Promise<UxpResult> {
  const doc = app.open(nativePathOf(root, job.inputIndd));
  const documentName = String(doc.name);
  const components: unknown[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  try {
    const items: Item[] = Array.from(doc.allPageItems ?? []);
    for (const item of items) {
      if (!isTextFrame(item)) {
        continue;
      }
      const id = componentIdOf(item);
      if (!id) {
        continue;
      }
      if (seen.has(id)) {
        duplicates.push(id);
        continue;
      }
      seen.add(id);
      const paragraphs: Item[] = item.parentStory.paragraphs.everyItem().getElements();
      components.push({
        id,
        status: labelValue(item, "prototype.status") ?? "approved",
        owner: labelValue(item, "prototype.owner"),
        effectiveFrom: labelValue(item, "prototype.effectiveFrom"),
        effectiveTo: labelValue(item, "prototype.effectiveTo"),
        blocks: paragraphsToBlocks(paragraphs),
      });
    }
  } finally {
    doc.close(SaveOptions.NO);
  }
  if (duplicates.length > 0) {
    throw new Error(`duplicate component labels in ${documentName}: ${duplicates.join(", ")}`);
  }
  if (components.length === 0) {
    throw new Error(`no labelled components found in ${documentName}; label text frames component:<id> or add a prototype.componentId script label`);
  }
  const register = { schemaVersion: 1, sourceHash: `indesign:${documentName}`, components };
  const parts = segments(job.outputJson);
  const fileName = parts.pop();
  if (!fileName) {
    throw new Error(`invalid outputJson path ${job.outputJson}`);
  }
  const folder = await ensureFolder(root, parts.join("/"));
  await writeTextAtomic(folder, fileName, JSON.stringify(register, null, 2));
  return completedResult(job.jobId, [job.outputJson]);
}
