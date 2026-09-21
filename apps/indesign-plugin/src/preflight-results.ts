function collectStrings(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out);
    }
  } else if (typeof value === "string" && value.trim() !== "") {
    out.push(value.trim());
  }
}

function isLabelledGroup(node: unknown[]): node is [string, unknown[]] {
  return node.length === 2 && typeof node[0] === "string" && Array.isArray(node[1]);
}

function isKeyValue(node: unknown): node is [string, string] {
  return Array.isArray(node) && node.length === 2 && typeof node[0] === "string" && typeof node[1] === "string";
}

/** One finding instance: strings (page item, page, description) plus optional [key, value] detail pairs. */
function renderLeaf(node: unknown[]): string {
  const parts: string[] = [];
  let hasDescription = false;
  for (const part of node) {
    if (typeof part === "string") {
      const text = part.replace(/\s*\n\s*/g, " / ").trim();
      if (text) {
        parts.push(text);
        hasDescription = hasDescription || part.includes("\n");
      }
    } else if (typeof part === "number") {
      parts.push(String(part));
    }
  }
  if (!hasDescription) {
    for (const part of node) {
      if (Array.isArray(part)) {
        for (const pair of part) {
          if (isKeyValue(pair)) {
            const text = `${pair[0]}: ${pair[1]}`;
            if (!parts.some((existing) => existing.includes(text))) {
              parts.push(text);
            }
          }
        }
      }
    }
  }
  return parts.join(" | ");
}

function walk(node: unknown, labels: string[], out: string[]): void {
  if (!Array.isArray(node)) {
    if (typeof node === "string" && node.trim() !== "") {
      out.push([...labels, node.trim()].join(" > "));
    }
    return;
  }
  if (isLabelledGroup(node)) {
    for (const child of node[1]) {
      walk(child, [...labels, node[0]], out);
    }
    return;
  }
  const leaf = renderLeaf(node);
  if (leaf) {
    out.push([...labels, leaf].join(" > "));
  }
}

/** UXP returns findings as flat rows that start with a nesting level: [1, category], [2, rule], [3, item, page, description, ...]. */
function isLevelRows(findings: unknown[]): findings is unknown[][] {
  return findings.length > 0 && findings.every((row) => Array.isArray(row) && typeof row[0] === "number");
}

function flattenLevelRows(rows: unknown[][]): string[] {
  const lines: string[] = [];
  const stack: string[] = [];
  for (const row of rows) {
    const level = Math.max(1, Number(row[0]));
    const parts = row.slice(1).filter((part): part is string | number => (typeof part === "string" && part.trim() !== "") || typeof part === "number").map((part) => String(part).replace(/\s*\n\s*/g, " / ").trim());
    if (parts.length === 0) {
      continue;
    }
    stack.length = level - 1;
    if (parts.length === 1) {
      stack[level - 1] = parts[0] as string;
    } else {
      const [item, page, ...rest] = parts;
      lines.push([...stack.filter(Boolean), `${item} | page ${page}${rest.length > 0 ? ` | ${rest.join(" | ")}` : ""}`].join(" > "));
    }
  }
  return lines;
}

/**
 * aggregatedResults is [profileName, documentName, findings]. Findings nest arbitrarily as
 * [label, children] groups (category, rule, sub-rule) ending in instance arrays. Each instance
 * becomes one line: `category > rule > sub-rule > item | page | description`.
 */
export function flattenAggregatedResults(results: unknown): string[] {
  if (!Array.isArray(results) || results.length < 3 || !Array.isArray(results[2])) {
    const fallback: string[] = [];
    collectStrings(results, fallback);
    return fallback;
  }
  const findings = results[2] as unknown[];
  if (isLevelRows(findings)) {
    return flattenLevelRows(findings);
  }
  const lines: string[] = [];
  for (const category of findings) {
    walk(category, [], lines);
  }
  return lines;
}
