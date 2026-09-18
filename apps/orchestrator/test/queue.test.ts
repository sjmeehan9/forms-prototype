import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalQueueCompositionAdapter, ensureQueue, queuePaths, writeJobAtomic } from "../src/adapters/composition/local-queue.js";
import { buildPlaceholderPdf } from "../src/adapters/composition/dry-run.js";
import { tempDir } from "./helpers.js";

describe("local queue", () => {
  it("writes jobs atomically and reads matching results", async () => {
    const home = await tempDir();
    const paths = await ensureQueue(home);
    const adapter = new LocalQueueCompositionAdapter(home, 5000, 20);
    await adapter.submit({ schemaVersion: 1, jobId: "job-1", type: "extract-content", inputIndd: "in.indd", outputJson: "out.json" });
    expect(await readdir(paths.inbox)).toEqual(["job-1.json"]);

    setTimeout(() => {
      void writeFile(
        path.join(paths.outbox, "job-1.json"),
        JSON.stringify({ schemaVersion: 1, jobId: "job-1", status: "completed", outputs: ["out.json"], checks: { overset: false, missingLinks: [], missingFonts: [], preflightErrors: [] } }),
      );
    }, 100);
    const result = await adapter.wait("job-1");
    expect(result.status).toBe("completed");
  });

  it("times out with a helpful message and rejects mismatched job ids", async () => {
    const home = await tempDir();
    const paths = await ensureQueue(home);
    const adapter = new LocalQueueCompositionAdapter(home, 150, 20);
    await expect(adapter.wait("never")).rejects.toThrow(/timed out .* Prototype Queue Worker/);
    await writeFile(
      path.join(paths.outbox, "job-2.json"),
      JSON.stringify({ schemaVersion: 1, jobId: "other", status: "completed", outputs: [], checks: { overset: false, missingLinks: [], missingFonts: [], preflightErrors: [] } }),
    );
    await expect(adapter.wait("job-2")).rejects.toThrow(/carries job id other/);
  });

  it("never leaves a .tmp file behind", async () => {
    const home = await tempDir();
    const file = await writeJobAtomic(queuePaths(home).inbox, { schemaVersion: 1, jobId: "j", type: "compose-document", template: "t", bundle: "b", outputDir: "o" });
    expect(path.basename(file)).toBe("j.json");
    expect(await readdir(path.dirname(file))).toEqual(["j.json"]);
  });
});

describe("placeholder PDF", () => {
  it("has a consistent cross-reference table", () => {
    const pdf = buildPlaceholderPdf("Title (test)", ["line one", "line \\ two"]).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, index) => {
      expect(pdf.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
  });
});
