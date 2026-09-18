import { describe, expect, it } from "vitest";
import { blocksToStoryText, completedResult, failedResult, hasCheckFailures, paragraphStyleFor, parseJobText } from "../src/text-model";
import { flattenAggregatedResults } from "../src/preflight-results";

describe("text model", () => {
  it("joins blocks with InDesign paragraph returns", () => {
    expect(blocksToStoryText([{ type: "paragraph", text: "a" }, { type: "list-item", text: "b", level: 1 }])).toBe("a\rb");
  });

  it("maps semantic styles to template paragraph styles", () => {
    const styleMap = { heading: "Heading 2", "list-item": "List Bullet", "list-item.2": "List Bullet 2", paragraph: "Body" };
    expect(paragraphStyleFor({ type: "paragraph", text: "x", style: "heading" }, styleMap)).toBe("Heading 2");
    expect(paragraphStyleFor({ type: "paragraph", text: "x" }, styleMap)).toBe("Body");
    expect(paragraphStyleFor({ type: "list-item", text: "x", level: 2 }, styleMap)).toBe("List Bullet 2");
    expect(paragraphStyleFor({ type: "list-item", text: "x", level: 3 }, styleMap)).toBe("List Bullet");
    expect(paragraphStyleFor({ type: "paragraph", text: "x", style: "unknown" }, {})).toBeUndefined();
  });

  it("parses jobs and builds results", () => {
    const job = parseJobText('{"schemaVersion":1,"jobId":"j","type":"extract-content","inputIndd":"a.indd","outputJson":"b.json"}');
    expect(job.type).toBe("extract-content");
    expect(() => parseJobText('{"schemaVersion":2,"jobId":"j","type":"extract-content","inputIndd":"a","outputJson":"b"}')).toThrow();
    expect(completedResult("j", ["x"]).status).toBe("completed");
    const failed = failedResult("j", "boom");
    expect(failed).toMatchObject({ status: "failed", error: "boom", outputs: [] });
    expect(hasCheckFailures(failed.checks)).toBe(false);
    expect(hasCheckFailures({ ...failed.checks, overset: true })).toBe(true);
  });
});

describe("preflight results", () => {
  it("flattens InDesign aggregated results into readable lines", () => {
    const results = ["[Basic]", "doc.indd", [["TEXT", [["Overset text", [["1", "Text frame on page 1"]]]]], ["LINKS", [["Missing link", [["2", "logo.svg"]]]]]]];
    expect(flattenAggregatedResults(results)).toEqual(["TEXT > Overset text: 1 Text frame on page 1", "LINKS > Missing link: 2 logo.svg"]);
    expect(flattenAggregatedResults(["[Basic]", "doc.indd", []])).toEqual([]);
    expect(flattenAggregatedResults("unexpected")).toEqual(["unexpected"]);
  });
});
