import { parse } from "csv-parse/sync";
import {
  BrandPackSchema,
  ComponentRegisterSchema,
  DataSetSchema,
  DocumentManifestSchema,
  parseWithSchema,
  type BrandPack,
  type ComponentRegister,
  type DataScalar,
  type DataSet,
  type DocumentManifest,
} from "@prototype/contracts";
import { PrototypeError, errorMessage, type SourceModel } from "./models.js";
import { resolveAssetFile } from "./resolver.js";

const DATA_COLUMNS = ["key", "value", "type", "status", "effectiveFrom", "effectiveTo", "source"] as const;

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

function coerceValue(raw: string, type: string): DataScalar | undefined {
  switch (type) {
    case "string":
      return raw;
    case "number": {
      if (raw.trim() === "") {
        return undefined;
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case "boolean": {
      const lowered = raw.trim().toLowerCase();
      if (["true", "yes", "1"].includes(lowered)) {
        return true;
      }
      if (["false", "no", "0"].includes(lowered)) {
        return false;
      }
      return undefined;
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : undefined;
    default:
      return undefined;
  }
}

/** Parse the product data CSV (`key,value,type,status,effectiveFrom,effectiveTo,source`) into typed values. */
export function parseProductData(csvText: string, sourceHash: string): DataSet {
  let rows: Record<string, string>[];
  try {
    rows = parse(csvText, {
      bom: true,
      columns: (header: string[]) => {
        const missing = DATA_COLUMNS.filter((column) => !header.includes(column));
        if (missing.length > 0) {
          throw new PrototypeError("validate", `product data is missing columns: ${missing.join(", ")}`);
        }
        return header;
      },
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (error) {
    if (error instanceof PrototypeError) {
      throw error;
    }
    throw new PrototypeError("validate", `product data could not be parsed: ${errorMessage(error)}`);
  }

  const issues: string[] = [];
  const seen = new Set<string>();
  const values: unknown[] = [];
  rows.forEach((row, index) => {
    const line = index + 2;
    const key = row.key ?? "";
    const type = row.type ?? "";
    const raw = row.value ?? "";
    if (seen.has(key)) {
      issues.push(`line ${line}: duplicate key ${key}`);
    }
    seen.add(key);
    const value = coerceValue(raw, type);
    if (value === undefined) {
      issues.push(`line ${line}: value "${raw}" is not a valid ${type || "(missing type)"}`);
      return;
    }
    values.push({
      key,
      value,
      type,
      status: row.status,
      effectiveFrom: emptyToUndefined(row.effectiveFrom),
      effectiveTo: emptyToUndefined(row.effectiveTo),
      source: emptyToUndefined(row.source),
    });
  });
  if (issues.length > 0) {
    throw new PrototypeError("validate", "product data is invalid", issues);
  }
  return parseWithSchema(DataSetSchema, { schemaVersion: 1, sourceHash, values }, "product data");
}

export function parseComponentRegister(json: unknown): ComponentRegister {
  return parseWithSchema(ComponentRegisterSchema, json, "component register");
}

export function parseDocumentManifest(json: unknown, label = "document manifest"): DocumentManifest {
  return parseWithSchema(DocumentManifestSchema, json, label);
}

export function parseBrandPack(json: unknown, label = "brand pack"): BrandPack {
  return parseWithSchema(BrandPackSchema, json, label);
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const found = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      found.add(id);
    }
    seen.add(id);
  }
  return [...found].sort();
}

/** Structural validation of the whole source model. Approval and effective dates are checked at resolve time. */
export function validateSourceModel(model: SourceModel): void {
  const issues: string[] = [];
  const componentIds = new Set(model.register.components.map((component) => component.id));
  const dataKeys = new Set(model.data.values.map((value) => value.key));
  const brands = new Map(model.brands.map((brand) => [brand.id, brand]));
  const templateNames = new Set(model.templates.map((template) => template.name));

  for (const id of duplicates(model.register.components.map((c) => c.id))) {
    issues.push(`duplicate component id ${id}`);
  }
  for (const id of duplicates(model.data.values.map((v) => v.key))) {
    issues.push(`duplicate data key ${id}`);
  }
  for (const id of duplicates(model.manifests.map((m) => m.id))) {
    issues.push(`duplicate document id ${id}`);
  }
  for (const id of duplicates(model.brands.map((b) => b.id))) {
    issues.push(`duplicate brand id ${id}`);
  }

  for (const manifest of model.manifests) {
    if (!templateNames.has(manifest.templateId)) {
      issues.push(`document ${manifest.id}: template ${manifest.templateId} is not in the template folder`);
    }
    const manifestBrands: BrandPack[] = [];
    for (const brandId of manifest.brandIds) {
      const brand = brands.get(brandId);
      if (!brand) {
        issues.push(`document ${manifest.id}: brand ${brandId} has no brand pack`);
      } else {
        manifestBrands.push(brand);
      }
    }
    for (const target of duplicates(manifest.bindings.map((b) => b.target))) {
      issues.push(`document ${manifest.id}: target ${target} is bound more than once`);
    }
    for (const binding of manifest.bindings) {
      const source = binding.source;
      if (source.type === "component" && !componentIds.has(source.id)) {
        issues.push(`document ${manifest.id}: component ${source.id} (target ${binding.target}) is not in the content library`);
      } else if (source.type === "data") {
        for (const brand of manifestBrands) {
          if (!dataKeys.has(source.key) && brand.data[source.key] === undefined) {
            issues.push(`document ${manifest.id}: data key ${source.key} (target ${binding.target}) is not in the product data or brand ${brand.id}`);
          }
        }
      } else if (source.type === "asset") {
        for (const brand of manifestBrands) {
          try {
            resolveAssetFile(source.id, brand, model.assets);
          } catch (error) {
            issues.push(`document ${manifest.id}: ${errorMessage(error)}`);
          }
        }
      }
    }
    for (const brand of manifestBrands) {
      for (const id of brand.mandatoryComponentIds) {
        const bound = manifest.bindings.some((b) => b.source.type === "component" && b.source.id === id);
        if (!bound) {
          issues.push(`document ${manifest.id}: brand ${brand.id} requires component ${id}, which is not bound`);
        }
      }
    }
    const fields = manifest.formFields ?? [];
    const nonRadioNames = fields.filter((f) => f.type !== "radio").map((f) => f.name);
    for (const name of duplicates(nonRadioNames)) {
      issues.push(`document ${manifest.id}: form field name ${name} is used more than once`);
    }
    for (const order of duplicates(fields.filter((f) => f.tabOrder !== undefined).map((f) => String(f.tabOrder)))) {
      issues.push(`document ${manifest.id}: tab order ${order} is used more than once`);
    }
    for (const target of duplicates(fields.map((f) => f.binding))) {
      issues.push(`document ${manifest.id}: form control ${target} is configured more than once`);
    }
  }

  for (const brand of model.brands) {
    for (const id of brand.mandatoryComponentIds) {
      if (!componentIds.has(id)) {
        issues.push(`brand ${brand.id}: mandatory component ${id} is not in the content library`);
      }
    }
    for (const assetId of Object.keys(brand.assets)) {
      try {
        resolveAssetFile(assetId, brand, model.assets);
      } catch (error) {
        issues.push(`brand ${brand.id}: ${errorMessage(error)}`);
      }
    }
  }

  if (issues.length > 0) {
    throw new PrototypeError("validate", "source package failed validation", issues.sort());
  }
}
