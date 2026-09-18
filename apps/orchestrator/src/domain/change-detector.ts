import { compareStrings, hashValue, sortRecord } from "./hash.js";
import { inputRef, type InputRef, type SourceModel, type SourceSnapshot } from "./models.js";

/** Hash every governed input so two runs over the same sources produce identical snapshots. */
export function computeSnapshot(model: SourceModel, createdAt: string): SourceSnapshot {
  const inputs: Record<InputRef, string> = {};
  for (const component of model.register.components) {
    inputs[inputRef("component", component.id)] = hashValue(component);
  }
  for (const value of model.data.values) {
    inputs[inputRef("data", value.key)] = hashValue(value);
  }
  for (const manifest of model.manifests) {
    inputs[inputRef("manifest", manifest.id)] = hashValue(manifest);
  }
  for (const brand of model.brands) {
    inputs[inputRef("brand", brand.id)] = hashValue(brand);
  }
  for (const template of model.templates) {
    inputs[inputRef("template", template.name)] = template.sha256;
  }
  for (const asset of model.assets) {
    inputs[inputRef("asset", asset.relativePath)] = asset.sha256;
  }
  return { schemaVersion: 1, createdAt, inputs: sortRecord(inputs) };
}

export type SnapshotDiff = {
  firstRun: boolean;
  /** Added or modified inputs. */
  changed: InputRef[];
  removed: InputRef[];
};

export function diffSnapshots(previous: SourceSnapshot | null, current: SourceSnapshot): SnapshotDiff {
  const currentKeys = Object.keys(current.inputs).sort(compareStrings);
  if (!previous) {
    return { firstRun: true, changed: currentKeys, removed: [] };
  }
  const changed = currentKeys.filter((key) => previous.inputs[key] !== current.inputs[key]);
  const removed = Object.keys(previous.inputs)
    .filter((key) => !(key in current.inputs))
    .sort(compareStrings);
  return { firstRun: false, changed, removed };
}

export function snapshotHash(snapshot: SourceSnapshot): string {
  return hashValue(snapshot.inputs);
}
