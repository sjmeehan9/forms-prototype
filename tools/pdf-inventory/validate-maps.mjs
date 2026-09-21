#!/usr/bin/env node
/**
 * Validate the ingestion maps against the local inventories: every source field must be mapped or
 * dropped exactly once, every reference must match the inventory's field name at that position, and
 * every mapped field must resolve in the shared dictionary.
 *
 * Usage: node tools/pdf-inventory/validate-maps.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const ingestDir = path.join(repoRoot, "fixtures", "demo-forms", "ingest");
const dictionary = JSON.parse(readFileSync(path.join(ingestDir, "field-dictionary.json"), "utf8"));

export function resolveDictionaryEntry(name) {
  let rest = name;
  let context = "";
  for (const [prefix, adjective] of Object.entries(dictionary.contexts)) {
    if (rest.startsWith(prefix)) {
      rest = rest.slice(prefix.length);
      context = adjective;
    }
  }
  let kind = "";
  let key = rest;
  for (const [prefix, adjective] of Object.entries(dictionary.kinds)) {
    if (rest.startsWith(prefix)) {
      kind = adjective;
      const family = prefix.split(".")[0];
      key = `${family}.*.${rest.slice(prefix.length)}`;
    }
  }
  const entry = dictionary.fields[key];
  if (!entry) {
    return null;
  }
  const lowerFirst = (text) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);
  const parts = [context, kind].filter(Boolean);
  const description = parts.length > 0 ? `${parts.join(" ")} ${lowerFirst(entry.label)}`.replace(/^./, (c) => c.toUpperCase()) : entry.label;
  return { ...entry, key, description: entry.hint ? `${description} (${entry.hint})` : description };
}

function parseRef(ref) {
  const match = /^p(\d+)#(\d+) (.*)$/.exec(ref);
  if (!match) {
    throw new Error(`malformed source reference "${ref}"`);
  }
  return { page: Number(match[1]), index: Number(match[2]), name: match[3] };
}

function main() {
  let problems = 0;
  for (const file of readdirSync(ingestDir).filter((f) => f.endsWith(".map.json")).sort()) {
    const map = JSON.parse(readFileSync(path.join(ingestDir, file), "utf8"));
    const inventoryPath = path.join(repoRoot, ".prototype", "ingest", map.source.slug, "inventory.json");
    if (!existsSync(inventoryPath)) {
      console.error(`${file}: inventory ${inventoryPath} is missing; run npm run ingest:inventory first`);
      problems += 1;
      continue;
    }
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    const seen = new Map();
    const issues = [];
    const useRef = (ref, purpose) => {
      const { page, index, name } = parseRef(ref);
      const field = inventory.pages.find((p) => p.number === page)?.fields[index - 1];
      if (!field) {
        issues.push(`${ref}: no such field in the inventory`);
        return;
      }
      if (field.name !== name) {
        issues.push(`${ref}: inventory has "${field.name}" at that position`);
      }
      const key = `p${page}#${index}`;
      if (seen.has(key)) {
        issues.push(`${ref}: referenced twice (${seen.get(key)} and ${purpose})`);
      }
      seen.set(key, purpose);
    };
    for (const field of map.fields) {
      const entry = resolveDictionaryEntry(field.name);
      if (!entry) {
        issues.push(`${field.name}: not in the field dictionary`);
      } else if (entry.type !== field.type) {
        issues.push(`${field.name}: map says ${field.type}, dictionary says ${entry.type}`);
      } else if (field.type === "radio" && !(field.exportValue in entry.options)) {
        issues.push(`${field.name}: export value ${field.exportValue} is not a dictionary option`);
      }
      if (field.source.length === 0 && !field.bounds) {
        issues.push(`${field.name}: added fields need explicit bounds`);
      }
      for (const ref of field.source) {
        useRef(ref, field.name);
      }
    }
    for (const drop of map.dropped) {
      for (const ref of drop.source ?? []) {
        useRef(ref, "dropped");
      }
    }
    const total = inventory.pages.reduce((sum, page) => sum + page.fields.length, 0);
    for (const page of inventory.pages) {
      page.fields.forEach((field, index) => {
        if (!seen.has(`p${page.number}#${index + 1}`)) {
          issues.push(`p${page.number}#${index + 1} ${field.name}: source field is neither mapped nor dropped`);
        }
      });
    }
    const widgets = map.fields.length;
    const names = new Set(map.fields.map((f) => f.name)).size;
    console.log(`${map.documentId}: ${total} source fields accounted for → ${widgets} controls, ${names} semantic names, ${map.dropped.length} documented drops; ${issues.length} issue(s)`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
    problems += issues.length;
  }
  process.exitCode = problems > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
