import { AutoSizingReferenceEnum, AutoSizingTypeEnum, Capitalization, ColorModel, ColorSpace, CornerOptions, Justification, ListType, MeasurementUnits, SaveOptions, app } from "indesign";
import type { Bounds, FormFieldType, LayoutTextStyle, Swatch } from "@prototype/contracts";
import { messageOf } from "./text-model";
import { ensureFolder, getEntry, nativePathOf, segments, type Entry } from "./uxp-fs";

export type Doc = any;
export type Item = any;

export const A4 = { width: 595.28, height: 841.89 };

/** InDesign geometric bounds are [top, left, bottom, right]. */
export function geometricBounds(bounds: Bounds): [number, number, number, number] {
  return [bounds.top, bounds.left, bounds.top + bounds.height, bounds.left + bounds.width];
}

export function newDocument(width: number = A4.width, height: number = A4.height): Doc {
  const doc = app.documents.add();
  try {
    doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
    doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
  } catch {
    // Units default to the application preference; geometry is in points either way.
  }
  try {
    doc.documentPreferences.facingPages = false;
    doc.documentPreferences.pageWidth = width;
    doc.documentPreferences.pageHeight = height;
  } catch {
    // Keep the default page size when the preference is read-only on this host.
  }
  return doc;
}

/**
 * New rectangles take the document's default object style, which carries a black stroke.
 * Applying the [None] object style first makes fill and stroke strictly opt-in.
 */
export function clearObjectStyle(doc: Doc, item: Item): void {
  try {
    const none = doc.objectStyles.itemByName("[None]");
    if (none && none.isValid) {
      item.appliedObjectStyle = none;
    }
  } catch {
    // Fall through to the explicit stroke reset below.
  }
  try {
    item.strokeWeight = 0;
    item.strokeColor = doc.swatches.itemByName("None");
    item.fillColor = doc.swatches.itemByName("None");
  } catch {
    // The object style already removed the stroke where this is not settable.
  }
}

/** Fill and stroke are applied only when named; everything else stays empty. */
export function paintItem(doc: Doc, item: Item, paint: { fill?: string | undefined; stroke?: string | undefined; strokeWeight?: number | undefined }): void {
  clearObjectStyle(doc, item);
  if (paint.fill) {
    item.fillColor = swatchOrNone(doc, paint.fill);
  }
  if (paint.stroke) {
    item.strokeColor = swatchOrNone(doc, paint.stroke);
    item.strokeWeight = paint.strokeWeight ?? 0.5;
  }
}

export function swatchOrNone(doc: Doc, name: string | undefined): Item {
  if (name) {
    const swatch = doc.swatches.itemByName(name);
    if (swatch && swatch.isValid) {
      return swatch;
    }
  }
  return doc.swatches.itemByName("None");
}

export function ensureSwatch(doc: Doc, name: string, swatch: Swatch): Item {
  let color = doc.colors.itemByName(name);
  if (!color || !color.isValid) {
    color = doc.colors.add({ name });
  }
  color.model = ColorModel.PROCESS;
  if (swatch.cmyk) {
    color.space = ColorSpace.CMYK;
    color.colorValue = swatch.cmyk;
  } else if (swatch.rgb) {
    color.space = ColorSpace.RGB;
    color.colorValue = swatch.rgb;
  }
  return color;
}

/** Create or update a paragraph style from a layout text style; cosmetic failures become notes, not errors. */
export function ensureParagraphStyle(doc: Doc, name: string, spec: LayoutTextStyle, notes: string[] = []): Item {
  let style = doc.paragraphStyles.itemByName(name);
  if (!style || !style.isValid) {
    style = doc.paragraphStyles.add({ name });
  }
  const attempt = (what: string, action: () => void): void => {
    try {
      action();
    } catch (error) {
      notes.push(`style ${name}: could not set ${what} (${messageOf(error)})`);
    }
  };
  if (spec.fontFamily) {
    attempt("font family", () => {
      style.appliedFont = spec.fontFamily;
    });
  }
  const fontStyle = spec.bold && spec.italic ? "Bold Italic" : spec.bold ? "Bold" : spec.italic ? "Italic" : "Regular";
  attempt("font style", () => {
    style.fontStyle = fontStyle;
  });
  attempt("hyphenation", () => {
    style.hyphenation = false;
  });
  style.pointSize = spec.pointSize;
  style.leading = spec.leading ?? Math.round(spec.pointSize * 1.25 * 10) / 10;
  style.spaceAfter = spec.spaceAfter ?? 0;
  if (spec.color) {
    attempt("colour", () => {
      style.fillColor = swatchOrNone(doc, spec.color);
    });
  }
  if (spec.align) {
    attempt("alignment", () => {
      style.justification = spec.align === "center" ? Justification.CENTER_ALIGN : spec.align === "right" ? Justification.RIGHT_ALIGN : Justification.LEFT_ALIGN;
    });
  }
  if (spec.allCaps) {
    attempt("capitalisation", () => {
      style.capitalization = Capitalization.ALL_CAPS;
    });
  }
  if (spec.bullets) {
    attempt("bullets", () => {
      style.bulletsAndNumberingListType = ListType.BULLET_LIST;
      style.leftIndent = spec.indent ?? 12;
      style.firstLineIndent = -(spec.indent ?? 12);
    });
  } else if (spec.indent) {
    attempt("indent", () => {
      style.leftIndent = spec.indent;
    });
  }
  return style;
}

export function addTextFrame(page: Item, bounds: Bounds, contents?: string, label?: string): Item {
  const frame = page.textFrames.add({ geometricBounds: geometricBounds(bounds) });
  if (label) {
    frame.label = label;
  }
  if (contents !== undefined) {
    frame.contents = contents;
  }
  return frame;
}

/** Let a frame grow downwards with its text so authored copy can never leave it overset. */
export function autoGrow(frame: Item): void {
  try {
    frame.textFramePreferences.autoSizingReferencePoint = AutoSizingReferenceEnum.TOP_LEFT_POINT;
    frame.textFramePreferences.autoSizingType = AutoSizingTypeEnum.HEIGHT_ONLY;
  } catch {
    // Without auto-sizing the authored frame heights still hold the content.
  }
}

export function applyParagraphStyles(doc: Doc, frame: Item, styleNames: (string | undefined)[]): void {
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

export function applyStyleToAll(doc: Doc, frame: Item, styleName: string | undefined): void {
  if (!styleName) {
    return;
  }
  const style = doc.paragraphStyles.itemByName(styleName);
  if (!style || !style.isValid) {
    throw new Error(`paragraph style "${styleName}" is not defined in the layout`);
  }
  const paragraphs: Item[] = frame.parentStory.paragraphs.everyItem().getElements();
  for (const paragraph of paragraphs) {
    paragraph.appliedParagraphStyle = style;
  }
}

export function roundCorners(item: Item, radius: number | undefined): void {
  if (!radius) {
    return;
  }
  try {
    for (const corner of ["topLeft", "topRight", "bottomLeft", "bottomRight"]) {
      item[`${corner}CornerOption`] = CornerOptions.ROUNDED_CORNER;
      item[`${corner}CornerRadius`] = radius;
    }
  } catch {
    // Rounded corners are decoration only.
  }
}

export function addFormControl(page: Item, control: FormFieldType, bounds: Bounds): Item {
  const box = { geometricBounds: geometricBounds(bounds) };
  switch (control) {
    case "checkbox":
      return page.checkBoxes.add(box);
    case "radio":
      return page.radioButtons.add(box);
    case "combo":
      return page.comboBoxes.add(box);
    case "list":
      return page.listBoxes.add(box);
    case "button":
      return page.buttons.add(box);
    case "signature":
      return page.signatureFields.add(box);
    default:
      return page.textBoxes.add(box);
  }
}

export async function saveAndClose(doc: Doc, root: Entry, jobPath: string, asTemplate: boolean): Promise<void> {
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

export function closeWithoutSaving(doc: Doc): void {
  try {
    doc.close(SaveOptions.NO);
  } catch {
    // Already closed.
  }
}
