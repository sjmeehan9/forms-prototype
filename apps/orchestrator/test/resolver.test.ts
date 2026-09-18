import path from "node:path";
import { describe, expect, it } from "vitest";
import { PrototypeError } from "../src/domain/models.js";
import { formatDataValue, resolveAssetFile, resolveBundle, usabilityIssue } from "../src/domain/resolver.js";
import { clone, loadFixtureModel } from "./helpers.js";

const TODAY = "2026-09-18";

describe("resolver", () => {
  it("merges manifest, brand, components and data into a bundle", async () => {
    const { model, dir } = await loadFixtureModel();
    const manifest = model.manifests.find((m) => m.id === "membership-form")!;
    const brand = model.brands.find((b) => b.id === "brand-a")!;
    const bundle = resolveBundle({ manifest, brand, model, today: TODAY, toJobPath: (p) => path.relative(dir, p) });
    expect(bundle.outputBaseName).toBe("membership-form--brand-a");
    expect(bundle.template).toBe(path.join("source", "templates", "membership-form.indt"));
    expect(bundle.bindings.map((b) => b.kind)).toEqual(["data", "data", "text", "text", "asset"]);
    const phone = bundle.bindings.find((b) => b.kind === "data" && b.key === "contact.phone");
    expect(phone).toMatchObject({ value: "1300 000 000", valueType: "string" });
    const logo = bundle.bindings.find((b) => b.kind === "asset");
    expect(logo).toMatchObject({ assetId: "brand.logo", path: path.join("source", "brands", "brand-a", "logo-brand-a.svg") });
    expect(bundle.formFields).toHaveLength(8);
    expect(bundle.swatches["brand.primary"]).toEqual({ cmyk: [100, 60, 0, 20] });
    expect(bundle.styleMap).toEqual({ heading: "Heading 2", body: "Body", "list-item": "List Bullet" });
  });

  it("applies brand data overrides", async () => {
    const { model, dir } = await loadFixtureModel();
    const manifest = model.manifests.find((m) => m.id === "member-guide")!;
    const brand = model.brands.find((b) => b.id === "brand-b")!;
    const bundle = resolveBundle({ manifest, brand, model, today: TODAY, toJobPath: (p) => path.relative(dir, p) });
    const name = bundle.bindings.find((b) => b.kind === "data" && b.key === "fund.name");
    expect(name).toMatchObject({ value: "Northwind Super" });
    const fee = bundle.bindings.find((b) => b.kind === "data" && b.key === "fees.admin.annual");
    expect(fee).toMatchObject({ value: "84", valueType: "number" });
  });

  it("refuses draft, not-yet-effective and expired inputs", async () => {
    const { model, dir } = await loadFixtureModel();
    const broken = clone(model);
    const manifest = broken.manifests.find((m) => m.id === "benefits-flyer")!;
    manifest.bindings.push({ target: "content:future", source: { type: "component", id: "future.clause" } });
    broken.register.components.find((c) => c.id === "benefits.summary")!.effectiveTo = "2026-01-31";
    broken.data.values.find((v) => v.key === "fees.admin.annual")!.effectiveFrom = "2027-07-01";
    const brand = broken.brands[0]!;
    try {
      resolveBundle({ manifest, brand, model: broken, today: TODAY, toJobPath: (p) => path.relative(dir, p) });
      expect.fail("expected resolution to fail");
    } catch (error) {
      const details = (error as PrototypeError).details;
      expect(details).toContainEqual("component future.clause is draft, not approved");
      expect(details).toContainEqual("component benefits.summary expired on 2026-01-31");
      expect(details).toContainEqual("data value fees.admin.annual is not effective until 2027-07-01");
    }
  });

  it("enforces mandatory brand components and asset resolution", async () => {
    const { model, dir } = await loadFixtureModel();
    const broken = clone(model);
    const manifest = broken.manifests.find((m) => m.id === "member-guide")!;
    manifest.bindings = manifest.bindings.filter((b) => !(b.source.type === "component" && b.source.id === "privacy.notice"));
    const brand = broken.brands.find((b) => b.id === "brand-a")!;
    brand.assets["brand.logo"] = "missing-logo.svg";
    expect(() => resolveBundle({ manifest, brand, model: broken, today: TODAY, toJobPath: (p) => path.relative(dir, p) })).toThrow(PrototypeError);
    try {
      resolveBundle({ manifest, brand, model: broken, today: TODAY, toJobPath: (p) => path.relative(dir, p) });
    } catch (error) {
      const details = (error as PrototypeError).details;
      expect(details).toContainEqual(expect.stringContaining("requires component privacy.notice"));
      expect(details).toContainEqual(expect.stringContaining("missing-logo.svg"));
    }
  });

  it("prefers brand folder assets over shared assets and matches by base name", async () => {
    const { model } = await loadFixtureModel();
    const brand = model.brands.find((b) => b.id === "brand-b")!;
    expect(resolveAssetFile("brand.logo", brand, model.assets).relativePath).toBe("brands/brand-b/logo-brand-b.svg");
    expect(resolveAssetFile("diagram.benefits", brand, model.assets).relativePath).toBe("assets/diagram.benefits.svg");
    expect(() => resolveAssetFile("nothing.here", brand, model.assets)).toThrow(/was not found/);
  });

  it("formats values and explains usability", () => {
    expect(formatDataValue(true, "boolean")).toBe("Yes");
    expect(formatDataValue(false, "boolean")).toBe("No");
    expect(formatDataValue(84, "number")).toBe("84");
    expect(usabilityIssue("component", "x", { status: "approved" }, TODAY)).toBeNull();
    expect(usabilityIssue("component", "x", { status: "approved", effectiveTo: "2026-09-17" }, TODAY)).toMatch(/expired/);
  });
});
