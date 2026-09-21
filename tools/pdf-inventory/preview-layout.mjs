#!/usr/bin/env node
/**
 * Render a layout spec to one SVG per page so a layout can be reviewed without InDesign.
 * Targets are drawn dashed green, form controls blue; fonts are approximations.
 *
 * Usage: node tools/pdf-inventory/preview-layout.mjs <layout.json> [outDir]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [layoutFile, outArg] = process.argv.slice(2);
if (!layoutFile) {
  console.error("usage: preview-layout.mjs <layout.json> [outDir]");
  process.exit(2);
}
const layout = JSON.parse(readFileSync(layoutFile, "utf8"));
const outDir = path.resolve(outArg ?? path.join(".prototype", "preview", layout.documentId));
mkdirSync(outDir, { recursive: true });

function colour(name) {
  if (!name) return "none";
  if (name === "Paper") return "#ffffff";
  if (name === "Black") return "#000000";
  const swatch = layout.swatches[name];
  if (!swatch) return "#ff00ff";
  if (swatch.rgb) return `rgb(${swatch.rgb.join(",")})`;
  const [c, m, y, k] = swatch.cmyk.map((v) => v / 100);
  const channel = (ink) => Math.round(255 * (1 - ink) * (1 - k));
  return `rgb(${channel(c)},${channel(m)},${channel(y)})`;
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrap(text, width, pointSize) {
  const limit = Math.max(4, Math.floor(width / (pointSize * 0.5)));
  const lines = [];
  for (const paragraph of text.split(/\r|\n/)) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      if ((line + " " + word).trim().length > limit && line) {
        lines.push(line);
        line = word;
      } else {
        line = (line + " " + word).trim();
      }
    }
    lines.push(line);
  }
  return lines;
}

function textBlock(bounds, text, styleName, fillOverride) {
  const style = layout.styles[styleName] ?? { pointSize: 9 };
  const leading = style.leading ?? style.pointSize * 1.25;
  const family = /Minion|Georgia|Times/i.test(style.fontFamily ?? "") ? "Georgia, serif" : "Helvetica, Arial, sans-serif";
  const anchor = style.align === "right" ? "end" : style.align === "center" ? "middle" : "start";
  const x = style.align === "right" ? bounds.left + bounds.width : style.align === "center" ? bounds.left + bounds.width / 2 : bounds.left;
  const content = style.allCaps ? text.toUpperCase() : text;
  return wrap(content, bounds.width, style.pointSize)
    .map((line, index) => `<text x="${x}" y="${bounds.top + style.pointSize + index * leading}" font-family="${family}" font-size="${style.pointSize}" font-weight="${style.bold ? 700 : 400}" font-style="${style.italic ? "italic" : "normal"}" text-anchor="${anchor}" fill="${fillOverride ?? colour(style.color ?? "Black")}">${escape(line)}</text>`)
    .join("");
}

for (const page of layout.pages) {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.page.width * 2}" height="${layout.page.height * 2}" viewBox="0 0 ${layout.page.width} ${layout.page.height}">`, `<rect width="100%" height="100%" fill="#ffffff"/>`];
  for (const element of page.elements) {
    const b = element.bounds;
    if (element.kind === "shape") {
      if (element.shape === "line") {
        parts.push(`<line x1="${b.left}" y1="${b.top}" x2="${b.left + b.width}" y2="${b.top + b.height}" stroke="${colour(element.stroke ?? element.fill)}" stroke-width="${element.strokeWeight ?? 0.5}"/>`);
      } else if (element.shape === "oval") {
        parts.push(`<ellipse cx="${b.left + b.width / 2}" cy="${b.top + b.height / 2}" rx="${b.width / 2}" ry="${b.height / 2}" fill="${colour(element.fill)}" stroke="${colour(element.stroke)}" stroke-width="${element.strokeWeight ?? 0}"/>`);
      } else {
        parts.push(`<rect x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" rx="${element.cornerRadius ?? 0}" fill="${colour(element.fill)}" stroke="${colour(element.stroke)}" stroke-width="${element.stroke ? (element.strokeWeight ?? 0.5) : 0}"/>`);
      }
    } else if (element.kind === "text") {
      parts.push(textBlock(b, element.text, element.style));
    } else if (element.kind === "target") {
      parts.push(`<rect x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" fill="rgba(0,160,80,0.07)" stroke="#00a050" stroke-width="0.4" stroke-dasharray="2 1.5"/>`);
      if (element.role === "asset") {
        parts.push(`<text x="${b.left + 2}" y="${b.top + 8}" font-family="Helvetica" font-size="5.5" fill="#00803c">${escape(element.label)}</text>`);
      } else {
        parts.push(textBlock(b, element.placeholder ?? element.label, element.style ?? Object.keys(layout.styles)[0], "#00803c"));
      }
    } else {
      parts.push(`<rect x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" fill="${element.fill ? colour(element.fill) : "none"}" stroke="#2a62d8" stroke-width="0.6"/>`);
      if (b.width > 40) {
        parts.push(`<text x="${b.left + 2}" y="${b.top + b.height - 4}" font-family="Helvetica" font-size="5" fill="#2a62d8">${escape(element.label.replace(/^field:/, ""))}</text>`);
      }
    }
  }
  parts.push("</svg>");
  // Quick Look thumbnails are square, so emit two overlapping square regions per page.
  const side = layout.page.width;
  for (const [suffix, offset] of [["a-top", 0], ["b-bottom", layout.page.height - side]]) {
    const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${side * 2.4}" height="${side * 2.4}" viewBox="0 ${offset} ${side} ${side}">`;
    const file = path.join(outDir, `page-${page.number}-${suffix}.svg`);
    writeFileSync(file, [header, ...parts.slice(1)].join("\n"));
    console.log(file);
  }
}
