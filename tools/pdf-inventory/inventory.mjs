#!/usr/bin/env node
/**
 * Build a local, machine-readable inventory of a reference PDF: metadata, form fields (PDFKit),
 * word-level text geometry and page renders (poppler), plus a draft field/label table.
 *
 * Inventories contain the source document's wording, so they are written under .prototype/ingest/
 * (ignored by git) and must never be copied into fixtures, Frame.io or chat.
 *
 * Usage: node tools/pdf-inventory/inventory.mjs <file.pdf> [--slug name] [--out dir]
 * Needs: macOS with Xcode command line tools (swiftc) and poppler (brew install poppler).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

function parseArgs(argv) {
  const args = { file: undefined, slug: undefined, out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--slug") args.slug = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (!args.file) args.file = arg;
  }
  if (!args.file) {
    console.error("usage: inventory.mjs <file.pdf> [--slug name] [--out dir]");
    process.exit(2);
  }
  return args;
}

function ensureFieldsBinary() {
  const source = path.join(here, "pdf-fields.swift");
  const binDir = path.join(repoRoot, ".prototype", "tools");
  const binary = path.join(binDir, "pdf-fields");
  mkdirSync(binDir, { recursive: true });
  if (!existsSync(binary) || statSync(binary).mtimeMs < statSync(source).mtimeMs) {
    console.error("compiling pdf-fields.swift …");
    execFileSync("swiftc", ["-O", source, "-o", binary], { stdio: ["ignore", "inherit", "inherit"] });
  }
  return binary;
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

const round1 = (value) => Math.round(value * 10) / 10;

/** Parse `pdftotext -bbox-layout` output into pages of text segments (runs of words without a wide gap). */
function parseBboxLayout(html) {
  const pages = [];
  const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
  let pageMatch;
  while ((pageMatch = pageRe.exec(html)) !== null) {
    const segments = [];
    const lineRe = /<line [^>]*>([\s\S]*?)<\/line>/g;
    let lineMatch;
    while ((lineMatch = lineRe.exec(pageMatch[3])) !== null) {
      const words = [];
      const wordRe = /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([\s\S]*?)<\/word>/g;
      let wordMatch;
      while ((wordMatch = wordRe.exec(lineMatch[1])) !== null) {
        words.push({ left: Number(wordMatch[1]), top: Number(wordMatch[2]), right: Number(wordMatch[3]), bottom: Number(wordMatch[4]), text: decodeEntities(wordMatch[5]) });
      }
      let current = [];
      const flush = () => {
        if (current.length === 0) return;
        const left = Math.min(...current.map((w) => w.left));
        const top = Math.min(...current.map((w) => w.top));
        const right = Math.max(...current.map((w) => w.right));
        const bottom = Math.max(...current.map((w) => w.bottom));
        segments.push({ text: current.map((w) => w.text).join(" "), left: round1(left), top: round1(top), width: round1(right - left), height: round1(bottom - top) });
        current = [];
      };
      for (const word of words) {
        const previous = current[current.length - 1];
        const gapLimit = previous ? Math.max(9, (previous.bottom - previous.top) * 1.1) : 0;
        if (previous && word.left - previous.right > gapLimit) flush();
        current.push(word);
      }
      flush();
    }
    pages.push({ width: Number(pageMatch[1]), height: Number(pageMatch[2]), segments });
  }
  return pages;
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** Nearest label candidates above, to the left and to the right of a field. */
function labelCandidates(field, segments) {
  const fieldRight = field.left + field.width;
  const fieldBottom = field.top + field.height;
  const centreY = field.top + field.height / 2;
  let above = null;
  let left = null;
  let right = null;
  for (const segment of segments) {
    const segRight = segment.left + segment.width;
    const segBottom = segment.top + segment.height;
    const segCentreY = segment.top + segment.height / 2;
    const verticalGap = field.top - segBottom;
    if (verticalGap >= -3 && verticalGap <= 24 && (overlap(segment.left, segRight, field.left, fieldRight) > 0 || Math.abs(segment.left - field.left) < 8)) {
      const score = verticalGap + Math.abs(segment.left - field.left) / 20;
      if (!above || score < above.score) above = { text: segment.text, score };
    }
    if (Math.abs(segCentreY - centreY) <= Math.max(6, field.height / 2) && segRight <= field.left + 3 && field.left - segRight <= 260) {
      const score = field.left - segRight;
      if (!left || score < left.score) left = { text: segment.text, score };
    }
    if (Math.abs(segCentreY - centreY) <= Math.max(6, field.height / 2) && segment.left >= fieldRight - 3 && segment.left - fieldRight <= 40) {
      const score = segment.left - fieldRight;
      if (!right || score < right.score) right = { text: segment.text, score };
    }
    void fieldBottom;
  }
  return { above: above?.text ?? "", left: left?.text ?? "", right: right?.text ?? "" };
}

const args = parseArgs(process.argv.slice(2));
const pdfPath = path.resolve(args.file);
const slug = args.slug ?? path.basename(pdfPath, path.extname(pdfPath)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const outDir = path.resolve(args.out ?? path.join(repoRoot, ".prototype", "ingest", slug));
mkdirSync(path.join(outDir, "pages"), { recursive: true });

const fieldsJson = JSON.parse(execFileSync(ensureFieldsBinary(), [pdfPath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const bboxFile = path.join(outDir, "text.bbox.html");
execFileSync("pdftotext", ["-bbox-layout", pdfPath, bboxFile], { stdio: ["ignore", "ignore", "ignore"] });
const textPages = parseBboxLayout(readFileSync(bboxFile, "utf8"));
execFileSync("pdftoppm", ["-r", "100", "-png", pdfPath, path.join(outDir, "pages", "page")], { stdio: ["ignore", "ignore", "ignore"] });
let fonts = "";
try {
  fonts = execFileSync("pdffonts", [pdfPath], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  fonts = "(pdffonts failed)";
}

const inventory = {
  schemaVersion: 1,
  source: { file: path.basename(pdfPath), sha256: createHash("sha256").update(readFileSync(pdfPath)).digest("hex"), ...fieldsJson.metadata },
  pages: fieldsJson.pages.map((page, index) => {
    const segments = textPages[index]?.segments ?? [];
    return {
      number: page.number,
      width: page.width,
      height: page.height,
      segments,
      links: page.links,
      fields: page.fields
        .map((field) => ({ ...field, labels: labelCandidates(field, segments) }))
        .sort((a, b) => a.top - b.top || a.left - b.left),
    };
  }),
};
writeFileSync(path.join(outDir, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
writeFileSync(path.join(outDir, "fonts.txt"), fonts);

const lines = [`# Field draft for ${inventory.source.file}`, "", `Pages ${inventory.source.pages}; creator ${inventory.source.creator ?? "?"}; encrypted ${inventory.source.encrypted}`, ""];
for (const page of inventory.pages) {
  lines.push(`## Page ${page.number} (${page.fields.length} fields, ${page.segments.length} text segments)`, "");
  if (page.fields.length > 0) {
    lines.push("| # | source name | type | left,top | w×h | max | comb | on | above | left | right |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    page.fields.forEach((field, index) => {
      const cell = (text) => String(text ?? "").replace(/\|/g, "/").slice(0, 60);
      lines.push(`| ${index + 1} | ${cell(field.name)} | ${field.type} | ${field.left},${field.top} | ${field.width}×${field.height} | ${field.maxLength || ""} | ${field.comb ? "y" : ""} | ${cell(field.onState)} | ${cell(field.labels.above)} | ${cell(field.labels.left)} | ${cell(field.labels.right)} |`);
    });
    lines.push("");
  }
}
writeFileSync(path.join(outDir, "fields-draft.md"), `${lines.join("\n")}\n`);

const total = inventory.pages.reduce((sum, page) => sum + page.fields.length, 0);
console.log(`${slug}: ${inventory.source.pages} pages, ${total} fields → ${path.relative(repoRoot, outDir)}`);
