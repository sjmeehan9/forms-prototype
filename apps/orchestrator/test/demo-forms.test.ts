import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentManifestSchema, LayoutSpecSchema, layoutLabelCounts, parseWithSchema } from "@prototype/contracts";
import { LOCAL_REQUEST_DEFAULTS } from "../src/adapters/local/orchestration.js";
import { LocalStorageAdapter } from "../src/adapters/local/storage.js";
import { buildDependencyGraph, selectAffectedTargets } from "../src/domain/dependency-graph.js";
import { PrototypeError, targetKey, type SourceModel } from "../src/domain/models.js";
import { resolveBundle } from "../src/domain/resolver.js";
import { parseComponentRegister } from "../src/domain/schemas.js";
import { silentLogger } from "../src/log.js";
import { downloadSourcePackage, loadSourceModel } from "../src/orchestrator/source-package.js";
import { readJson } from "../src/util/fs.js";
import { REPO_ROOT, clone, tempDir } from "./helpers.js";

const DEMO_DIR = path.join(REPO_ROOT, "fixtures", "demo-forms");
const STORE = path.join(DEMO_DIR, "store");
const MANIFEST_DIR = path.join(STORE, "02 Templates and assets", "document-manifests");
const DOCUMENTS = ["consolidate-super", "fund-nomination", "update-details"];
const TODAY = "2026-09-21";

async function loadDemoModel(): Promise<{ model: SourceModel; dir: string }> {
  const dir = await tempDir("demo-forms-");
  const pkg = await downloadSourcePackage(new LocalStorageAdapter(STORE), LOCAL_REQUEST_DEFAULTS, path.join(dir, "source"), silentLogger);
  const register = parseComponentRegister(await readJson(path.join(STORE, "01 Source content", "component-register.json")));
  return { model: await loadSourceModel(pkg, register), dir };
}

describe("demo forms: layouts and manifests", () => {
  it("has one layout and one manifest per document", () => {
    expect(readdirSync(path.join(DEMO_DIR, "layouts")).sort()).toEqual(DOCUMENTS.map((id) => `${id}.layout.json`));
    expect(readdirSync(MANIFEST_DIR).sort()).toEqual(DOCUMENTS.map((id) => `${id}.json`));
  });

  it.each(DOCUMENTS)("%s: every manifest binding and form control occurs exactly once in the layout", async (documentId) => {
    const layout = parseWithSchema(LayoutSpecSchema, await readJson(path.join(DEMO_DIR, "layouts", `${documentId}.layout.json`)), "layout");
    const manifest = parseWithSchema(DocumentManifestSchema, await readJson(path.join(MANIFEST_DIR, `${documentId}.json`)), "manifest");
    expect(layout.templateId).toBe(manifest.templateId);
    const counts = layoutLabelCounts(layout);
    const wanted = [...manifest.bindings.map((binding) => binding.target), ...(manifest.formFields ?? []).map((field) => field.binding)];
    expect(new Set(wanted).size).toBe(wanted.length);
    for (const label of wanted) {
      expect(counts.get(label), `label ${label}`).toBe(1);
    }
    expect([...counts.keys()].filter((label) => !wanted.includes(label))).toEqual([]);
    const styles = new Set(Object.keys(layout.styles));
    for (const page of layout.pages) {
      for (const element of page.elements) {
        if ((element.kind === "text" || element.kind === "target") && element.style) {
          expect(styles.has(element.style), `style ${element.style}`).toBe(true);
        }
      }
    }
    for (const styleName of Object.values(manifest.styleMap ?? {})) {
      expect(styles.has(styleName), `component style ${styleName}`).toBe(true);
    }
    const tabOrders = (manifest.formFields ?? []).map((field) => field.tabOrder);
    expect(tabOrders).toEqual(tabOrders.map((_, index) => index + 1));
  });
});

describe("demo forms: source model", () => {
  it("validates and yields six outputs", async () => {
    const { model } = await loadDemoModel();
    expect(model.manifests.map((m) => m.id).sort()).toEqual(DOCUMENTS);
    expect(model.brands.map((b) => b.id).sort()).toEqual(["example-super", "northwind-retirement"]);
    expect(buildDependencyGraph(model).targets).toHaveLength(6);
  });

  it("propagates shared content and data selectively", async () => {
    const { model } = await loadDemoModel();
    const graph = buildDependencyGraph(model);
    const affected = (ref: string): string[] => selectAffectedTargets(graph, [ref]).map((entry) => targetKey(entry.target));
    expect(affected("component:privacy.statement")).toHaveLength(6);
    expect(affected("component:tfn.notice")).toEqual(["consolidate-super--example-super", "consolidate-super--northwind-retirement", "update-details--example-super", "update-details--northwind-retirement"]);
    expect(affected("data:contact.hours")).toEqual(["consolidate-super--example-super", "consolidate-super--northwind-retirement", "update-details--example-super", "update-details--northwind-retirement"]);
    expect(affected("data:fund.spin")).toEqual(["fund-nomination--example-super"]);
    expect(affected("brand:northwind-retirement")).toEqual(["consolidate-super--northwind-retirement", "fund-nomination--northwind-retirement", "update-details--northwind-retirement"]);
    expect(affected("template:fund-nomination.indt")).toEqual(["fund-nomination--example-super", "fund-nomination--northwind-retirement"]);
  });

  it("resolves every output with brand facts and readable dates", async () => {
    const { model, dir } = await loadDemoModel();
    for (const manifest of model.manifests) {
      for (const brand of model.brands) {
        const bundle = resolveBundle({ manifest, brand, model, today: TODAY, toJobPath: (p) => path.relative(dir, p) });
        expect(bundle.bindings).toHaveLength(manifest.bindings.length);
      }
    }
    const nomination = model.manifests.find((m) => m.id === "fund-nomination")!;
    const northwind = model.brands.find((b) => b.id === "northwind-retirement")!;
    const bundle = resolveBundle({ manifest: nomination, brand: northwind, model, today: TODAY, toJobPath: (p) => path.relative(dir, p) });
    const value = (label: string): string | undefined => {
      const binding = bundle.bindings.find((b) => b.target === label);
      return binding?.kind === "data" ? binding.value : undefined;
    };
    expect(value("data:fund.name@panel")).toBe("Northwind Retirement");
    expect(value("data:fund.spin@panel")).toBe("NWR0100AU");
    expect(value("data:letter.compliance.date@letter")).toBe("1 July 2026");
    expect(value("data:contact.phone@panel")).toBe("1800 975 708");
  });

  it("refuses a draft component", async () => {
    const { model, dir } = await loadDemoModel();
    const broken = clone(model);
    const manifest = broken.manifests.find((m) => m.id === "consolidate-super")!;
    const privacy = manifest.bindings.find((b) => b.source.type === "component" && b.source.id === "privacy.statement")!;
    privacy.source = { type: "component", id: "privacy.statement.draft2027" };
    const brand = broken.brands.find((b) => b.id === "example-super")!;
    brand.mandatoryComponentIds = [];
    try {
      resolveBundle({ manifest, brand, model: broken, today: TODAY, toJobPath: (p) => path.relative(dir, p) });
      expect.fail("expected the draft component to be refused");
    } catch (error) {
      expect((error as PrototypeError).details).toContainEqual("component privacy.statement.draft2027 is draft, not approved");
    }
  });
});
