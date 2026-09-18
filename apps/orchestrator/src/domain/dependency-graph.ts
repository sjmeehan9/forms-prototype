import { compareStrings } from "./hash.js";
import { PrototypeError, compareTargets, inputRef, targetKey, type InputRef, type OutputTarget, type SourceModel } from "./models.js";
import { resolveAssetFile } from "./resolver.js";

export type TargetDependencies = { target: OutputTarget; inputs: InputRef[] };

export type DependencyGraph = {
  targets: TargetDependencies[];
  /** Reverse index: input reference to every output target that depends on it. */
  dependents: Map<InputRef, OutputTarget[]>;
};

export function buildDependencyGraph(model: SourceModel): DependencyGraph {
  const brands = new Map(model.brands.map((brand) => [brand.id, brand]));
  const targets: TargetDependencies[] = [];

  for (const manifest of [...model.manifests].sort((a, b) => compareStrings(a.id, b.id))) {
    for (const brandId of [...manifest.brandIds].sort(compareStrings)) {
      const brand = brands.get(brandId);
      if (!brand) {
        throw new PrototypeError("validate", `document ${manifest.id} references unknown brand ${brandId}`);
      }
      const inputs = new Set<InputRef>([
        inputRef("manifest", manifest.id),
        inputRef("template", manifest.templateId),
        inputRef("brand", brandId),
      ]);
      for (const binding of manifest.bindings) {
        const source = binding.source;
        if (source.type === "component") {
          inputs.add(inputRef("component", source.id));
        } else if (source.type === "data") {
          // A brand override makes the target depend on the brand pack (already listed), not on the shared value.
          if (brand.data[source.key] === undefined) {
            inputs.add(inputRef("data", source.key));
          }
        } else {
          try {
            inputs.add(inputRef("asset", resolveAssetFile(source.id, brand, model.assets).relativePath));
          } catch {
            inputs.add(inputRef("asset", source.id));
          }
        }
      }
      targets.push({ target: { documentId: manifest.id, brandId }, inputs: [...inputs].sort(compareStrings) });
    }
  }

  const dependents = new Map<InputRef, OutputTarget[]>();
  for (const entry of targets) {
    for (const ref of entry.inputs) {
      const list = dependents.get(ref) ?? [];
      list.push(entry.target);
      dependents.set(ref, list);
    }
  }
  return { targets, dependents };
}

export type AffectedTarget = { target: OutputTarget; reasons: InputRef[] };

/** Every target reachable from a changed input, sorted, with the inputs that caused its selection. */
export function selectAffectedTargets(graph: DependencyGraph, changed: InputRef[]): AffectedTarget[] {
  const byKey = new Map<string, AffectedTarget>();
  for (const ref of [...changed].sort(compareStrings)) {
    for (const target of graph.dependents.get(ref) ?? []) {
      const key = targetKey(target);
      const entry = byKey.get(key) ?? { target, reasons: [] };
      entry.reasons.push(ref);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort((a, b) => compareTargets(a.target, b.target));
}
