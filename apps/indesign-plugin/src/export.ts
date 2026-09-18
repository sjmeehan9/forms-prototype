import { ExportFormat, app } from "indesign";

export function saveIndd(doc: any, nativePath: string): void {
  doc.save(nativePath);
}

/** Print PDF with tagged structure; uses the High Quality Print preset when present. */
export function exportPrintPdf(doc: any, nativePath: string): void {
  try {
    app.pdfExportPreferences.includeStructure = true;
  } catch {
    // Older hosts may not expose the preference; tagging is then left to the preset.
  }
  let preset: any = null;
  try {
    preset = app.pdfExportPresets.itemByName("[High Quality Print]");
    if (!preset || !preset.isValid) {
      preset = null;
    }
  } catch {
    preset = null;
  }
  if (preset) {
    doc.exportFile(ExportFormat.PDF_TYPE, nativePath, false, preset);
  } else {
    doc.exportFile(ExportFormat.PDF_TYPE, nativePath, false);
  }
}

/** Interactive PDF keeps form fields; Acrobat remains the finishing and verification tool. */
export function exportInteractivePdf(doc: any, nativePath: string): void {
  try {
    app.interactivePDFExportPreferences.includeStructure = true;
  } catch {
    // Not every host exposes this preference on interactive export.
  }
  doc.exportFile(ExportFormat.INTERACTIVE_PDF, nativePath, false);
}
