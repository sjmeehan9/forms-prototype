import type {
  BrandPack,
  DataScalar,
  DataValueType,
  DocumentManifest,
  ResolvedBinding,
  ResolvedDocumentBundle,
} from "@prototype/contracts";
import { PrototypeError, errorMessage, type SourceFile, type SourceModel } from "./models.js";

function stripExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

/**
 * Resolve a semantic asset id for a brand. The brand pack may map the id to a file name;
 * otherwise the id itself is the file base name. Brand folder files win over shared assets.
 */
export function resolveAssetFile(assetId: string, brand: BrandPack, assets: SourceFile[]): SourceFile {
  const fileName = brand.assets[assetId] ?? assetId;
  const brandPrefix = `brands/${brand.id}/`;
  const matches = (file: SourceFile): boolean => file.name === fileName || stripExtension(file.name) === fileName;

  const inBrand = assets.filter((file) => file.relativePath.startsWith(brandPrefix) && matches(file));
  if (inBrand.length > 1) {
    throw new PrototypeError("resolve", `asset ${assetId} matches several files under ${brandPrefix}: ${inBrand.map((f) => f.name).join(", ")}`);
  }
  const [brandFile] = inBrand;
  if (brandFile) {
    return brandFile;
  }

  const shared = assets.filter((file) => file.relativePath.startsWith("assets/") && matches(file));
  if (shared.length > 1) {
    throw new PrototypeError("resolve", `asset ${assetId} matches several files under assets/: ${shared.map((f) => f.name).join(", ")}`);
  }
  const [sharedFile] = shared;
  if (sharedFile) {
    return sharedFile;
  }
  throw new PrototypeError("resolve", `asset ${assetId} (file ${fileName}) was not found under ${brandPrefix} or assets/ for brand ${brand.id}`);
}

type Governed = { status: string; effectiveFrom?: string | undefined; effectiveTo?: string | undefined };

/** Return a human-readable reason the item cannot be used today, or null when it can. */
export function usabilityIssue(kind: string, id: string, item: Governed, today: string): string | null {
  if (item.status !== "approved") {
    return `${kind} ${id} is ${item.status}, not approved`;
  }
  if (item.effectiveFrom && today < item.effectiveFrom) {
    return `${kind} ${id} is not effective until ${item.effectiveFrom}`;
  }
  if (item.effectiveTo && today > item.effectiveTo) {
    return `${kind} ${id} expired on ${item.effectiveTo}`;
  }
  return null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Typed values are formatted here, once, so templates never carry formatting rules. */
export function formatDataValue(value: DataScalar, type: DataValueType): string {
  if (type === "boolean") {
    return value === true || value === "true" ? "Yes" : "No";
  }
  if (type === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
    if (match && month) {
      return `${Number(match[3])} ${month} ${match[1]}`;
    }
  }
  return String(value);
}

function inferType(value: DataScalar): DataValueType {
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  return "string";
}

export type ResolveInput = {
  manifest: DocumentManifest;
  brand: BrandPack;
  model: SourceModel;
  /** YYYY-MM-DD used for effective-date checks. */
  today: string;
  /** Converts an absolute local path into the job-relative path the UXP worker expects. */
  toJobPath: (absolutePath: string) => string;
};

/** Merge manifest, brand pack, approved components and typed data into one bundle for composition. */
export function resolveBundle({ manifest, brand, model, today, toJobPath }: ResolveInput): ResolvedDocumentBundle {
  const issues: string[] = [];
  const components = new Map(model.register.components.map((component) => [component.id, component]));
  const data = new Map(model.data.values.map((value) => [value.key, value]));
  const template = model.templates.find((file) => file.name === manifest.templateId);
  if (!template) {
    issues.push(`template ${manifest.templateId} was not found in the template folder`);
  }

  const bindings: ResolvedBinding[] = [];
  for (const binding of manifest.bindings) {
    const source = binding.source;
    if (source.type === "component") {
      const component = components.get(source.id);
      if (!component) {
        issues.push(`component ${source.id} (target ${binding.target}) is not in the content library`);
        continue;
      }
      const issue = usabilityIssue("component", source.id, component, today);
      if (issue) {
        issues.push(issue);
        continue;
      }
      bindings.push({ kind: "text", target: binding.target, componentId: component.id, blocks: component.blocks });
    } else if (source.type === "data") {
      const override = brand.data[source.key];
      const base = data.get(source.key);
      if (override !== undefined) {
        const type = base?.type ?? inferType(override);
        bindings.push({ kind: "data", target: binding.target, key: source.key, value: formatDataValue(override, type), valueType: type });
      } else if (base) {
        const issue = usabilityIssue("data value", source.key, base, today);
        if (issue) {
          issues.push(issue);
          continue;
        }
        bindings.push({ kind: "data", target: binding.target, key: source.key, value: formatDataValue(base.value, base.type), valueType: base.type });
      } else {
        issues.push(`data key ${source.key} (target ${binding.target}) is not in the product data or in brand ${brand.id}`);
      }
    } else {
      try {
        const file = resolveAssetFile(source.id, brand, model.assets);
        bindings.push({ kind: "asset", target: binding.target, assetId: source.id, path: toJobPath(file.absolutePath) });
      } catch (error) {
        issues.push(errorMessage(error));
      }
    }
  }

  for (const id of brand.mandatoryComponentIds) {
    const bound = manifest.bindings.some((binding) => binding.source.type === "component" && binding.source.id === id);
    if (!bound) {
      issues.push(`brand ${brand.id} requires component ${id}, which document ${manifest.id} does not bind`);
    }
  }

  if (!template || issues.length > 0) {
    throw new PrototypeError("resolve", `cannot resolve document ${manifest.id} for brand ${brand.id}`, issues);
  }

  return {
    schemaVersion: 1,
    documentId: manifest.id,
    brandId: brand.id,
    brandName: brand.name,
    archetype: manifest.archetype,
    templateId: manifest.templateId,
    template: toJobPath(template.absolutePath),
    outputBaseName: `${manifest.id}--${brand.id}`,
    bindings,
    swatches: brand.swatches,
    styleMap: manifest.styleMap ?? {},
    formFields: manifest.formFields ?? [],
    output: manifest.output,
  };
}
