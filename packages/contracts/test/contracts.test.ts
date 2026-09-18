import { describe, expect, it } from "vitest";
import {
  BuildRequestSchema,
  ContractError,
  DocumentManifestSchema,
  UxpJobSchema,
  UxpResultSchema,
  parseWithSchema,
} from "../src/index.js";

describe("contracts", () => {
  it("parses a minimal build request and leaves source ids to the defaults", () => {
    const request = parseWithSchema(
      BuildRequestSchema,
      { schemaVersion: 1, requestId: "req-001", requestedAt: "2026-09-18T00:00:00Z" },
      "request",
    );
    expect(request.requestId).toBe("req-001");
    expect(request.source).toBeUndefined();
  });

  it("rejects unknown schema versions", () => {
    expect(() =>
      parseWithSchema(BuildRequestSchema, { schemaVersion: 2, requestId: "x", requestedAt: "now" }, "request"),
    ).toThrow(ContractError);
  });

  it("reports the path of each issue", () => {
    try {
      parseWithSchema(
        DocumentManifestSchema,
        {
          schemaVersion: 1,
          id: "Bad Id",
          archetype: "poster",
          templateId: "t.indt",
          bindings: [],
          brandIds: [],
          output: { printPdf: true, interactivePdf: false, saveIndd: true },
        },
        "manifest",
      );
      expect.fail("expected a ContractError");
    } catch (error) {
      expect(error).toBeInstanceOf(ContractError);
      const issues = (error as ContractError).issues;
      expect(issues.some((issue) => issue.startsWith("id:"))).toBe(true);
      expect(issues.some((issue) => issue.startsWith("archetype:"))).toBe(true);
      expect(issues.some((issue) => issue.startsWith("brandIds:"))).toBe(true);
    }
  });

  it("discriminates queue jobs by type", () => {
    const job = parseWithSchema(
      UxpJobSchema,
      { schemaVersion: 1, jobId: "j1", type: "compose-document", template: "t", bundle: "b", outputDir: "o" },
      "job",
    );
    expect(job.type).toBe("compose-document");
    expect(() =>
      parseWithSchema(UxpJobSchema, { schemaVersion: 1, jobId: "j1", type: "render", template: "t" }, "job"),
    ).toThrow(ContractError);
  });

  it("accepts the create-samples helper job", () => {
    const job = parseWithSchema(
      UxpJobSchema,
      { schemaVersion: 1, jobId: "s", type: "create-samples", register: "r.json", manifestDir: "m", brandDir: "b", libraryOutput: "lib.indd", templateOutputDir: "t" },
      "job",
    );
    expect(job.type).toBe("create-samples");
  });

  it("requires the checks block on results", () => {
    expect(() =>
      parseWithSchema(UxpResultSchema, { schemaVersion: 1, jobId: "j1", status: "completed", outputs: [] }, "result"),
    ).toThrow(/checks/);
  });
});
