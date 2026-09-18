import { CLEAN_CHECKS, UxpJobSchema, parseWithSchema, type ComponentBlock, type UxpChecks, type UxpJob, type UxpResult } from "@prototype/contracts";

/** InDesign paragraph separator. */
export const PARAGRAPH_SEPARATOR = "\r";

export function blocksToStoryText(blocks: ComponentBlock[]): string {
  return blocks.map((block) => block.text).join(PARAGRAPH_SEPARATOR);
}

/**
 * Semantic style resolution: an explicit block style wins, list items fall back from
 * `list-item.<level>` to `list-item`, plain paragraphs to `paragraph`. Undefined keeps the template style.
 */
export function paragraphStyleFor(block: ComponentBlock, styleMap: Record<string, string>): string | undefined {
  if (block.style && styleMap[block.style]) {
    return styleMap[block.style];
  }
  if (block.type === "list-item") {
    return styleMap[`list-item.${block.level}`] ?? styleMap["list-item"];
  }
  return styleMap["paragraph"];
}

export function parseJobText(text: string): UxpJob {
  return parseWithSchema(UxpJobSchema, JSON.parse(text), "job");
}

export function completedResult(jobId: string, outputs: string[], checks: UxpChecks = CLEAN_CHECKS, notes: string[] = []): UxpResult {
  return { schemaVersion: 1, jobId, status: "completed", outputs, checks, ...(notes.length > 0 ? { notes } : {}) };
}

export function failedResult(jobId: string, error: string, checks: UxpChecks = CLEAN_CHECKS, outputs: string[] = [], notes: string[] = []): UxpResult {
  return { schemaVersion: 1, jobId, status: "failed", outputs, checks, error, ...(notes.length > 0 ? { notes } : {}) };
}

export function hasCheckFailures(checks: UxpChecks): boolean {
  return checks.overset || checks.missingLinks.length > 0 || checks.missingFonts.length > 0 || checks.preflightErrors.length > 0;
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * UXP exposes InDesign enumeration values as objects, so `===` against a constant never matches.
 * Adobe's guidance is to compare the string forms of both sides.
 */
export function enumEquals(actual: unknown, expected: unknown): boolean {
  if (actual === expected) {
    return true;
  }
  if (actual === undefined || actual === null || expected === undefined || expected === null) {
    return false;
  }
  return String(actual) === String(expected);
}

export function enumName(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "unknown";
  }
}

/** InDesign reports font names as "Family<TAB>Style"; make them readable. */
export function normalizeFontName(name: unknown): string {
  return String(name).replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
}
