import type { FailureRecord, ReleaseManifest } from "@prototype/contracts";
import { compareStrings, hashValue, sha256Hex } from "./hash.js";

export function createReleaseId(now: Date, seed: string): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `rel-${stamp}-${sha256Hex(seed).slice(0, 8)}`;
}

export type ReleaseInput = Omit<ReleaseManifest, "schemaVersion" | "releaseHash">;

/** Build the manifest and stamp it with a hash that ignores ids, timestamps and storage ids. */
export function createReleaseManifest(input: ReleaseInput): ReleaseManifest {
  const releaseHash = hashValue({
    inputs: input.inputs,
    outputSelection: input.outputSelection,
    outputs: input.outputs
      .map((output) => ({ documentId: output.documentId, brandId: output.brandId, kind: output.kind, sha256: output.sha256 }))
      .sort((a, b) => compareStrings(`${a.documentId}/${a.brandId}/${a.kind}`, `${b.documentId}/${b.brandId}/${b.kind}`)),
    validation: input.validation,
    status: input.status,
  });
  return { schemaVersion: 1, ...input, releaseHash };
}

function short(hash: string): string {
  return hash.slice(0, 12);
}

/** Human-readable where-used and release report for reviewers. */
export function renderReleaseReport(manifest: ReleaseManifest): string {
  const lines: string[] = [];
  lines.push(`# Release ${manifest.releaseId}`, "");
  lines.push(`- Request: ${manifest.requestId} (folder \`${manifest.requestFolder}\`)`);
  lines.push(`- Status: **${manifest.status}**`);
  lines.push(`- Created: ${manifest.createdAt}`);
  lines.push(`- Application: ${manifest.applicationVersion} (storage ${manifest.storageMode}, composition ${manifest.compositionMode})`);
  lines.push(`- Release hash: \`${short(manifest.releaseHash)}\``, "");

  lines.push("## Changed inputs", "");
  if (manifest.firstRun) {
    lines.push("First run: every output was built.", "");
  } else if (manifest.changedInputs.length === 0) {
    lines.push("No governed input changed since the last successful release.", "");
  } else {
    for (const ref of manifest.changedInputs) {
      lines.push(`- \`${ref}\``);
    }
    lines.push("");
  }

  lines.push("## Affected outputs", "");
  lines.push("| Document | Brand | Rebuilt | Why |", "| --- | --- | --- | --- |");
  for (const selection of manifest.outputSelection) {
    const why = selection.rebuilt ? selection.reasons.map((r) => `\`${r}\``).join(", ") : "no changed inputs";
    lines.push(`| ${selection.documentId} | ${selection.brandId} | ${selection.rebuilt ? "yes" : "no"} | ${why} |`);
  }
  lines.push("");

  lines.push("## Outputs", "");
  if (manifest.outputs.length === 0) {
    lines.push("No outputs were produced.", "");
  } else {
    lines.push("| Document | Brand | Kind | File | SHA-256 |", "| --- | --- | --- | --- | --- |");
    for (const output of manifest.outputs) {
      lines.push(`| ${output.documentId} | ${output.brandId} | ${output.kind} | ${output.path} | \`${short(output.sha256)}\` |`);
    }
    lines.push("");
  }

  lines.push("## Checks", "");
  if (manifest.checks.length === 0) {
    lines.push("No composition checks were recorded.", "");
  } else {
    lines.push("| Document | Brand | Overset | Missing links | Missing fonts | Preflight errors |", "| --- | --- | --- | --- | --- | --- |");
    for (const check of manifest.checks) {
      lines.push(`| ${check.documentId} | ${check.brandId} | ${check.overset ? "yes" : "no"} | ${check.missingLinks.length} | ${check.missingFonts.length} | ${check.preflightErrors.length} |`);
    }
    lines.push("");
  }

  lines.push("## Validation", "");
  lines.push(`Result: **${manifest.validation.status}**`);
  for (const error of manifest.validation.errors) {
    lines.push(`- ${error}`);
  }
  lines.push("");

  lines.push("## Source files", "");
  lines.push("| File | Version | SHA-256 |", "| --- | --- | --- |");
  for (const file of manifest.sourceFiles) {
    lines.push(`| ${file.path} | ${file.version ?? "n/a"} | \`${short(file.sha256)}\` |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function createFailureRecord(args: {
  requestId: string;
  requestFolder: string;
  failedAt: string;
  stage: string;
  message: string;
  details: string[];
}): FailureRecord {
  return { schemaVersion: 1, ...args };
}
