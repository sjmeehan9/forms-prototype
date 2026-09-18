import { describe, expect, it } from "vitest";
import { PrototypeError } from "../src/domain/models.js";
import { parseProductData, validateSourceModel } from "../src/domain/schemas.js";
import { clone, loadFixtureModel } from "./helpers.js";

const HEADER = "key,value,type,status,effectiveFrom,effectiveTo,source\n";

function detailsOf(action: () => unknown): string[] {
  try {
    action();
  } catch (error) {
    return error instanceof PrototypeError ? error.details : [String(error)];
  }
  throw new Error("expected the action to throw");
}

describe("parseProductData", () => {
  it("coerces typed values", () => {
    const data = parseProductData(`${HEADER}a.number,84,number,approved,,,x\na.bool,yes,boolean,approved,,,x\na.date,2026-07-01,date,approved,2026-07-01,2027-06-30,x\na.text,hello,string,draft,,,`, "hash");
    expect(data.values.map((v) => v.value)).toEqual([84, true, "2026-07-01", "hello"]);
    expect(data.values[2]?.effectiveTo).toBe("2027-06-30");
    expect(data.values[3]?.status).toBe("draft");
    expect(data.values[3]?.source).toBeUndefined();
  });

  it("rejects duplicate keys and invalid values with line numbers", () => {
    expect(detailsOf(() => parseProductData(`${HEADER}a,1,number,approved,,,\na,2,number,approved,,,`, "h"))).toContainEqual("line 3: duplicate key a");
    expect(detailsOf(() => parseProductData(`${HEADER}a,abc,number,approved,,,`, "h"))).toContainEqual('line 2: value "abc" is not a valid number');
    expect(detailsOf(() => parseProductData(`${HEADER}a,1,decimal,approved,,,`, "h"))).toContainEqual('line 2: value "1" is not a valid decimal');
  });

  it("rejects missing columns and bad statuses", () => {
    expect(() => parseProductData("key,value\na,1", "h")).toThrow(/missing columns/);
    expect(() => parseProductData(`${HEADER}a,1,number,pending,,,`, "h")).toThrow(/status/);
  });
});

describe("validateSourceModel", () => {
  it("accepts the fixture", async () => {
    const { model } = await loadFixtureModel();
    expect(() => validateSourceModel(model)).not.toThrow();
    expect(model.manifests).toHaveLength(3);
    expect(model.brands).toHaveLength(2);
  });

  it("lists every structural problem", async () => {
    const { model } = await loadFixtureModel();
    const broken = clone(model);
    broken.manifests[0]!.bindings.push({ target: "content:nope", source: { type: "component", id: "nope" } });
    broken.manifests[1]!.brandIds.push("brand-z");
    broken.brands[0]!.mandatoryComponentIds.push("ghost.clause");
    broken.register.components.push(clone(broken.register.components[0]!));
    try {
      validateSourceModel(broken);
      expect.fail("expected validation to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PrototypeError);
      const details = (error as PrototypeError).details;
      expect(details).toContainEqual(expect.stringContaining("component nope"));
      expect(details).toContainEqual(expect.stringContaining("brand brand-z has no brand pack"));
      expect(details).toContainEqual(expect.stringContaining("mandatory component ghost.clause"));
      expect(details).toContainEqual(expect.stringContaining("duplicate component id privacy.notice"));
    }
  });

  it("rejects unresolvable assets and duplicate tab order", async () => {
    const { model } = await loadFixtureModel();
    const broken = clone(model);
    broken.manifests[0]!.bindings.push({ target: "asset:missing", source: { type: "asset", id: "no.such.asset" } });
    const form = broken.manifests.find((m) => m.archetype === "form")!;
    form.formFields![1]!.tabOrder = 1;
    const details = detailsOf(() => validateSourceModel(broken));
    expect(details).toContainEqual(expect.stringContaining("no.such.asset"));
    expect(details).toContainEqual(expect.stringContaining("tab order 1 is used more than once"));
  });
});
