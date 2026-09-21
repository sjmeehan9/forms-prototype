import { describe, expect, it } from "vitest";
import { blocksToStoryText, completedResult, enumEquals, failedResult, hasCheckFailures, normalizeFontName, paragraphStyleFor, parseJobText } from "../src/text-model";
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
  it("flattens the nested shape InDesign returns into one line per finding", () => {
    const description = "Problem: Missing font\nFix: Edit the source file to apply a different font.";
    const details = [["Problem", "Missing font"], ["Fix", "Edit the source file to apply a different font."]];
    const results = [
      "[Basic]",
      "doc.indd",
      [
        ["TEXT (4)", [["Missing font (4)", [["Arial (2)", [["logo-brand-a.svg", "1", description, details], ["diagram.benefits.svg", "1", description, details]]]]]]],
        ["LINKS (1)", [["Missing link (1)", [["photo.jpg", "2", "Problem: Missing link", [["Problem", "Missing link"]]]]]]],
      ],
    ];
    expect(flattenAggregatedResults(results)).toEqual([
      "TEXT (4) > Missing font (4) > Arial (2) > logo-brand-a.svg | 1 | Problem: Missing font / Fix: Edit the source file to apply a different font.",
      "TEXT (4) > Missing font (4) > Arial (2) > diagram.benefits.svg | 1 | Problem: Missing font / Fix: Edit the source file to apply a different font.",
      "LINKS (1) > Missing link (1) > photo.jpg | 2 | Problem: Missing link",
    ]);
    const levelRows = ["[Basic]", "doc.indd", [[1, "TEXT (1)"], [2, "Overset text (1)"], [3, "Text Frame", "1", "Problem: Overset text: 5 characters\nFix: Resize the text frame."]]];
    expect(flattenAggregatedResults(levelRows)).toEqual(["TEXT (1) > Overset text (1) > Text Frame | page 1 | Problem: Overset text: 5 characters / Fix: Resize the text frame."]);
    expect(flattenAggregatedResults(["[Basic]", "doc.indd", []])).toEqual([]);
    expect(flattenAggregatedResults("unexpected")).toEqual(["unexpected"]);
  });
});

describe("enum helpers", () => {
  it("compares UXP enum objects by their string form", () => {
    const normal = { toString: () => "1852797549" };
    const other = { toString: () => "1819242340" };
    expect(enumEquals(normal, { toString: () => "1852797549" })).toBe(true);
    expect(enumEquals(normal, other)).toBe(false);
    expect(enumEquals(undefined, normal)).toBe(false);
    expect(enumEquals(7, 7)).toBe(true);
    expect(normalizeFontName("Minion Pro\tRegular")).toBe("Minion Pro Regular");
  });
});
