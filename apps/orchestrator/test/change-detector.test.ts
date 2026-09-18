import { describe, expect, it } from "vitest";
import { computeSnapshot, diffSnapshots, snapshotHash } from "../src/domain/change-detector.js";
import { hashValue, stableStringify } from "../src/domain/hash.js";
import { clone, loadFixtureModel } from "./helpers.js";

describe("change detection", () => {
  it("hashes independently of key order", () => {
    expect(stableStringify({ b: 1, a: { d: [1, 2], c: null } })).toBe('{"a":{"c":null,"d":[1,2]},"b":1}');
    expect(hashValue({ x: 1, y: 2 })).toBe(hashValue({ y: 2, x: 1 }));
  });

  it("produces identical snapshots for identical sources", async () => {
    const first = await loadFixtureModel();
    const second = await loadFixtureModel();
    const a = computeSnapshot(first.model, "2026-09-18T00:00:00Z");
    const b = computeSnapshot(second.model, "2026-09-19T00:00:00Z");
    expect(a.inputs).toEqual(b.inputs);
    expect(snapshotHash(a)).toBe(snapshotHash(b));
    expect(Object.keys(a.inputs)).toEqual([...Object.keys(a.inputs)].sort());
    expect(Object.keys(a.inputs)).toContain("asset:brands/brand-a/logo-brand-a.svg");
    expect(Object.keys(a.inputs)).toContain("template:member-guide.indt");
  });

  it("reports the first run and later only the changed inputs", async () => {
    const { model } = await loadFixtureModel();
    const before = computeSnapshot(model, "t0");
    expect(diffSnapshots(null, before).firstRun).toBe(true);

    const changed = clone(model);
    const phone = changed.data.values.find((v) => v.key === "contact.phone")!;
    phone.value = "1300 111 222";
    changed.register.components = changed.register.components.filter((c) => c.id !== "future.clause");
    const after = computeSnapshot(changed, "t1");
    const diff = diffSnapshots(before, after);
    expect(diff.firstRun).toBe(false);
    expect(diff.changed).toEqual(["data:contact.phone"]);
    expect(diff.removed).toEqual(["component:future.clause"]);
  });
});
