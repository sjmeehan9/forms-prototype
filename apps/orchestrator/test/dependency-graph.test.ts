import { describe, expect, it } from "vitest";
import { buildDependencyGraph, selectAffectedTargets } from "../src/domain/dependency-graph.js";
import { targetKey } from "../src/domain/models.js";
import { loadFixtureModel } from "./helpers.js";

async function affectedKeys(changed: string[]): Promise<string[]> {
  const { model } = await loadFixtureModel();
  const graph = buildDependencyGraph(model);
  return selectAffectedTargets(graph, changed).map((entry) => targetKey(entry.target));
}

describe("dependency graph", () => {
  it("creates one target per document and brand", async () => {
    const { model } = await loadFixtureModel();
    const graph = buildDependencyGraph(model);
    expect(graph.targets.map((t) => targetKey(t.target))).toEqual([
      "benefits-flyer--brand-a",
      "benefits-flyer--brand-b",
      "member-guide--brand-a",
      "member-guide--brand-b",
      "membership-form--brand-a",
      "membership-form--brand-b",
    ]);
  });

  it("propagates a shared component to every document", async () => {
    expect(await affectedKeys(["component:privacy.notice"])).toHaveLength(6);
  });

  it("propagates a data value only to the documents that bind it", async () => {
    const keys = await affectedKeys(["data:contact.phone"]);
    expect(keys).toEqual(["benefits-flyer--brand-a", "benefits-flyer--brand-b", "membership-form--brand-a", "membership-form--brand-b"]);
  });

  it("treats a brand override as a brand dependency, not a shared data dependency", async () => {
    const keys = await affectedKeys(["data:fund.name"]);
    expect(keys).toEqual(["benefits-flyer--brand-a", "member-guide--brand-a", "membership-form--brand-a"]);
    expect(await affectedKeys(["brand:brand-b"])).toEqual(["benefits-flyer--brand-b", "member-guide--brand-b", "membership-form--brand-b"]);
  });

  it("selects template and asset dependents", async () => {
    expect(await affectedKeys(["template:membership-form.indt"])).toEqual(["membership-form--brand-a", "membership-form--brand-b"]);
    expect(await affectedKeys(["asset:brands/brand-a/logo-brand-a.svg"])).toEqual(["benefits-flyer--brand-a", "member-guide--brand-a", "membership-form--brand-a"]);
    expect(await affectedKeys(["asset:assets/diagram.benefits.svg"])).toEqual(["benefits-flyer--brand-a", "benefits-flyer--brand-b"]);
  });

  it("records every reason for a selection and ignores unknown inputs", async () => {
    const { model } = await loadFixtureModel();
    const graph = buildDependencyGraph(model);
    const selected = selectAffectedTargets(graph, ["data:contact.phone", "component:form.instructions", "component:unknown"]);
    const form = selected.find((entry) => targetKey(entry.target) === "membership-form--brand-a");
    expect(form?.reasons).toEqual(["component:form.instructions", "data:contact.phone"]);
  });
});
