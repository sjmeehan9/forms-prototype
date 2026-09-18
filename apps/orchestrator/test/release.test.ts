import { describe, expect, it } from "vitest";
import { createReleaseId, createReleaseManifest, renderReleaseReport, type ReleaseInput } from "../src/domain/release.js";

function input(overrides: Partial<ReleaseInput> = {}): ReleaseInput {
  return {
    releaseId: "rel-1",
    requestId: "req-1",
    requestFolder: "req-1",
    createdAt: "2026-09-18T00:00:00Z",
    applicationVersion: "0.1.0",
    storageMode: "local",
    compositionMode: "dry-run",
    sourceFiles: [{ path: "data/product-data.csv", sha256: "abc", size: 10 }],
    inputs: { "data:contact.phone": "h1", "component:privacy.notice": "h2" },
    changedInputs: ["data:contact.phone"],
    firstRun: false,
    outputSelection: [
      { documentId: "membership-form", brandId: "brand-a", rebuilt: true, reasons: ["data:contact.phone"] },
      { documentId: "member-guide", brandId: "brand-a", rebuilt: false, reasons: [] },
    ],
    outputs: [{ documentId: "membership-form", brandId: "brand-a", kind: "indd", path: "brand-a/membership-form--brand-a.indd", sha256: "out1", size: 5 }],
    checks: [{ documentId: "membership-form", brandId: "brand-a", overset: false, missingLinks: [], missingFonts: [], preflightErrors: [] }],
    validation: { status: "passed", errors: [] },
    status: "completed",
    ...overrides,
  };
}

describe("release evidence", () => {
  it("hashes deterministically regardless of ids, timestamps and storage ids", () => {
    const a = createReleaseManifest(input());
    const b = createReleaseManifest(
      input({
        releaseId: "rel-2",
        createdAt: "2027-01-01T00:00:00Z",
        outputs: [{ documentId: "membership-form", brandId: "brand-a", kind: "indd", path: "elsewhere.indd", sha256: "out1", size: 5, storageId: "abc" }],
      }),
    );
    expect(a.releaseHash).toBe(b.releaseHash);
    const c = createReleaseManifest(input({ outputs: [{ ...input().outputs[0]!, sha256: "different" }] }));
    expect(c.releaseHash).not.toBe(a.releaseHash);
    expect(a.schemaVersion).toBe(1);
  });

  it("derives release ids from time and a seed", () => {
    const id = createReleaseId(new Date("2026-09-18T10:15:00.123Z"), "seed");
    expect(id).toMatch(/^rel-20260918T101500Z-[0-9a-f]{8}$/);
    expect(createReleaseId(new Date("2026-09-18T10:15:00.123Z"), "other")).not.toBe(id);
  });

  it("renders a human-readable report", () => {
    const report = renderReleaseReport(createReleaseManifest(input()));
    expect(report).toContain("# Release rel-1");
    expect(report).toContain("| membership-form | brand-a | yes | `data:contact.phone` |");
    expect(report).toContain("| member-guide | brand-a | no | no changed inputs |");
    expect(report).toContain("## Source files");
  });
});
