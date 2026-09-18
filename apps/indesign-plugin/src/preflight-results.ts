function collectStrings(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out);
    }
  } else if (typeof value === "string" && value.trim() !== "") {
    out.push(value);
  }
}

/**
 * aggregatedResults is nested: [profileName, documentName, [[category, [[rule, [[page, description]...]]...]]...]].
 * Flatten each finding into one readable line; fall back to every string when the shape differs.
 */
export function flattenAggregatedResults(results: unknown): string[] {
  if (!Array.isArray(results) || results.length < 3 || !Array.isArray(results[2])) {
    const fallback: string[] = [];
    collectStrings(results, fallback);
    return fallback;
  }
  const lines: string[] = [];
  for (const category of results[2] as unknown[]) {
    if (!Array.isArray(category) || category.length < 2 || !Array.isArray(category[1])) {
      collectStrings(category, lines);
      continue;
    }
    const categoryName = String(category[0]);
    for (const rule of category[1] as unknown[]) {
      if (!Array.isArray(rule) || rule.length < 2 || !Array.isArray(rule[1])) {
        collectStrings(rule, lines);
        continue;
      }
      const ruleName = String(rule[0]);
      for (const instance of rule[1] as unknown[]) {
        const detail: string[] = [];
        collectStrings(instance, detail);
        lines.push(`${categoryName} > ${ruleName}: ${detail.join(" ")}`.trim());
      }
    }
  }
  return lines;
}
