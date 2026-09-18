import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CLEAN_CHECKS,
  ResolvedDocumentBundleSchema,
  parseWithSchema,
  type UxpJob,
  type UxpResult,
} from "@prototype/contracts";
import { PrototypeError } from "../../domain/models.js";
import type { Logger } from "../../log.js";
import { ensureDir, readJson, toPosix, writeJsonAtomic } from "../../util/fs.js";
import type { CompositionAdapter } from "../types.js";

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

/** A small but valid single-page PDF so Frame.io and Acrobat can open dry-run outputs. */
export function buildPlaceholderPdf(title: string, lines: string[]): Buffer {
  const content = [
    "BT",
    "/F1 14 Tf",
    "50 790 Td",
    "16 TL",
    `(${escapePdfText(title)}) Tj`,
    "/F1 10 Tf",
    ...lines.slice(0, 45).map((line) => `T* (${escapePdfText(line.slice(0, 95))}) Tj`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/**
 * Simulates the UXP worker without InDesign: copies a known component register for extract jobs and writes
 * placeholder INDD/PDF files for compose jobs. Used by the fixture E2E and by `COMPOSITION_MODE=dry-run`.
 */
export class DryRunCompositionAdapter implements CompositionAdapter {
  private readonly jobs = new Map<string, UxpJob>();

  constructor(
    private readonly home: string,
    private readonly registerSourcePath: string,
    private readonly log: Logger,
  ) {}

  private resolve(jobPath: string): string {
    return path.join(this.home, ...jobPath.split("/"));
  }

  async submit(job: UxpJob): Promise<void> {
    this.jobs.set(job.jobId, job);
  }

  async wait(jobId: string): Promise<UxpResult> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new PrototypeError("compose", `dry-run adapter has no job ${jobId}`);
    }
    if (job.type === "extract-content") {
      return this.extract(job);
    }
    return this.compose(job);
  }

  private async extract(job: Extract<UxpJob, { type: "extract-content" }>): Promise<UxpResult> {
    this.log.info(`[dry-run] extract-content: copying ${this.registerSourcePath} instead of reading ${job.inputIndd}`);
    const register = await readJson(this.registerSourcePath);
    await writeJsonAtomic(this.resolve(job.outputJson), register);
    return { schemaVersion: 1, jobId: job.jobId, status: "completed", outputs: [job.outputJson], checks: CLEAN_CHECKS, notes: ["dry-run: register copied from fixture"] };
  }

  private async compose(job: Extract<UxpJob, { type: "compose-document" }>): Promise<UxpResult> {
    const bundle = parseWithSchema(ResolvedDocumentBundleSchema, await readJson(this.resolve(job.bundle)), `bundle ${job.bundle}`);
    const outputDir = this.resolve(job.outputDir);
    await ensureDir(outputDir);
    const templateExists = await readFile(this.resolve(job.template)).then(() => true, () => false);
    if (!templateExists) {
      return { schemaVersion: 1, jobId: job.jobId, status: "failed", outputs: [], checks: CLEAN_CHECKS, error: `template ${job.template} not found` };
    }
    const lines = [
      `Document ${bundle.documentId} for ${bundle.brandName} (${bundle.brandId})`,
      `Template ${bundle.templateId}, archetype ${bundle.archetype}`,
      "",
      ...bundle.bindings.flatMap((binding) => {
        if (binding.kind === "text") {
          return [`[${binding.target}] component ${binding.componentId}:`, ...binding.blocks.map((block) => `  ${block.type === "list-item" ? "- " : ""}${block.text}`)];
        }
        if (binding.kind === "data") {
          return [`[${binding.target}] ${binding.key} = ${binding.value}`];
        }
        return [`[${binding.target}] asset ${binding.assetId} -> ${binding.path}`];
      }),
      "",
      ...bundle.formFields.map((field) => `field ${field.name} (${field.type}) tab ${field.tabOrder ?? "-"}`),
    ];
    const outputs: string[] = [];
    const write = async (fileName: string, content: Buffer | string): Promise<void> => {
      const file = path.join(outputDir, fileName);
      await writeFile(file, content);
      outputs.push(toPosix(path.join(job.outputDir, fileName)));
    };
    if (bundle.output.saveIndd) {
      await write(`${bundle.outputBaseName}.indd`, `DRY-RUN INDD PLACEHOLDER\n${lines.join("\n")}\n`);
    }
    if (bundle.output.printPdf) {
      await write(`${bundle.outputBaseName}.pdf`, buildPlaceholderPdf(`${bundle.documentId} / ${bundle.brandName} (print, dry run)`, lines));
    }
    if (bundle.output.interactivePdf) {
      await write(`${bundle.outputBaseName}-interactive.pdf`, buildPlaceholderPdf(`${bundle.documentId} / ${bundle.brandName} (interactive, dry run)`, lines));
    }
    this.log.info(`[dry-run] compose-document ${bundle.outputBaseName}: wrote ${outputs.length} placeholder output(s)`);
    return { schemaVersion: 1, jobId: job.jobId, status: "completed", outputs, checks: CLEAN_CHECKS, notes: ["dry-run: placeholder outputs, InDesign was not used"] };
  }
}
