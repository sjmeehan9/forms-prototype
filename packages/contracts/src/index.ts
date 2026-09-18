/**
 * Shared, JSON-safe contracts for the orchestrator (Node) and the InDesign UXP plugin.
 * This file is bundled into the UXP plugin: never import Node-only modules here.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;
const schemaVersion = z.literal(SCHEMA_VERSION);

// ---- Build states ---------------------------------------------------------

export const BUILD_STATES = ["Ready to generate", "Generating", "Ready for review", "Failed"] as const;
export const BuildStateSchema = z.enum(BUILD_STATES);
export type BuildState = z.infer<typeof BuildStateSchema>;

// ---- Primitive value shapes ----------------------------------------------

export const IdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "identifiers use letters, digits, dots, hyphens or underscores");

export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dates use YYYY-MM-DD");

export const ApprovalStatusSchema = z.enum(["approved", "draft"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

// ---- Build request --------------------------------------------------------

export const BuildRequestSourceSchema = z.object({
  contentLibraryFileId: z.string().min(1),
  dataFileId: z.string().min(1),
  manifestFolderId: z.string().min(1),
  templateFolderId: z.string().min(1),
  assetFolderId: z.string().min(1),
  brandFolderId: z.string().min(1),
});
export type BuildRequestSource = z.infer<typeof BuildRequestSourceSchema>;

export const BuildRequestSchema = z.object({
  schemaVersion,
  requestId: z.string().min(1),
  requestedAt: z.string().min(1),
  /** Any omitted source id is filled from the bootstrap defaults for the storage mode. */
  source: BuildRequestSourceSchema.partial().optional(),
  documentIds: z.array(IdSchema).optional(),
  brandIds: z.array(IdSchema).optional(),
});
export type BuildRequest = z.infer<typeof BuildRequestSchema>;

// ---- Reusable content -----------------------------------------------------

export const ComponentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string(), style: z.string().optional() }),
  z.object({
    type: z.literal("list-item"),
    text: z.string(),
    level: z.number().int().min(1),
    style: z.string().optional(),
  }),
]);
export type ComponentBlock = z.infer<typeof ComponentBlockSchema>;

export const ComponentSchema = z.object({
  id: IdSchema,
  status: ApprovalStatusSchema,
  owner: z.string().optional(),
  effectiveFrom: DateStringSchema.optional(),
  effectiveTo: DateStringSchema.optional(),
  blocks: z.array(ComponentBlockSchema).min(1),
});
export type Component = z.infer<typeof ComponentSchema>;

export const ComponentRegisterSchema = z.object({
  schemaVersion,
  sourceHash: z.string(),
  components: z.array(ComponentSchema),
});
export type ComponentRegister = z.infer<typeof ComponentRegisterSchema>;

// ---- Product data ---------------------------------------------------------

export const DataValueTypeSchema = z.enum(["string", "number", "date", "boolean"]);
export type DataValueType = z.infer<typeof DataValueTypeSchema>;

export const DataScalarSchema = z.union([z.string(), z.number(), z.boolean()]);
export type DataScalar = z.infer<typeof DataScalarSchema>;

export const DataValueSchema = z.object({
  key: IdSchema,
  value: DataScalarSchema,
  type: DataValueTypeSchema,
  status: ApprovalStatusSchema,
  effectiveFrom: DateStringSchema.optional(),
  effectiveTo: DateStringSchema.optional(),
  source: z.string().optional(),
});
export type DataValue = z.infer<typeof DataValueSchema>;

export const DataSetSchema = z.object({
  schemaVersion,
  sourceHash: z.string(),
  values: z.array(DataValueSchema),
});
export type DataSet = z.infer<typeof DataSetSchema>;

// ---- Document manifest ----------------------------------------------------

export const ArchetypeSchema = z.enum(["form", "short-guide", "long-guide"]);
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const BindingSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("component"), id: IdSchema }),
  z.object({ type: z.literal("data"), key: IdSchema }),
  z.object({ type: z.literal("asset"), id: IdSchema }),
]);
export type BindingSource = z.infer<typeof BindingSourceSchema>;

export const BindingSchema = z.object({
  /** Script label of the target object in the InDesign template, e.g. `content:privacy.notice`. */
  target: z.string().min(1),
  source: BindingSourceSchema,
});
export type Binding = z.infer<typeof BindingSchema>;

export const FormFieldTypeSchema = z.enum(["text", "checkbox", "radio", "combo", "list", "button", "signature"]);
export type FormFieldType = z.infer<typeof FormFieldTypeSchema>;

export const FormFieldSchema = z.object({
  /** Semantic PDF field name, e.g. `member.givenName`. Radio buttons in one group share a name. */
  name: z.string().min(1),
  type: FormFieldTypeSchema,
  /** Script label of the form control authored in the template. */
  binding: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  exportValue: z.string().optional(),
  group: z.string().optional(),
  options: z.array(z.string()).optional(),
  tabOrder: z.number().int().min(1).optional(),
});
export type FormField = z.infer<typeof FormFieldSchema>;

export const OutputOptionsSchema = z.object({
  printPdf: z.boolean(),
  interactivePdf: z.boolean(),
  saveIndd: z.boolean(),
});
export type OutputOptions = z.infer<typeof OutputOptionsSchema>;

export const DocumentManifestSchema = z.object({
  schemaVersion,
  id: IdSchema,
  archetype: ArchetypeSchema,
  /** File name of the template inside the template folder, e.g. `membership-form.indt`. */
  templateId: z.string().min(1),
  bindings: z.array(BindingSchema),
  brandIds: z.array(IdSchema).min(1),
  formFields: z.array(FormFieldSchema).optional(),
  /** Semantic style name (from component blocks) to InDesign paragraph style name. */
  styleMap: z.record(z.string(), z.string()).optional(),
  output: OutputOptionsSchema,
});
export type DocumentManifest = z.infer<typeof DocumentManifestSchema>;

// ---- Brand pack -----------------------------------------------------------

export const SwatchSchema = z
  .object({
    cmyk: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100), z.number().min(0).max(100), z.number().min(0).max(100)]).optional(),
    rgb: z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]).optional(),
  })
  .refine((swatch) => swatch.cmyk !== undefined || swatch.rgb !== undefined, { message: "a swatch needs cmyk or rgb values" });
export type Swatch = z.infer<typeof SwatchSchema>;

export const BrandPackSchema = z.object({
  schemaVersion,
  id: IdSchema,
  name: z.string().min(1),
  /** Semantic swatch name (as named in the template) to colour values. */
  swatches: z.record(z.string(), SwatchSchema).default({}),
  /** Semantic asset id (e.g. `brand.logo`) to a file name inside the brand folder or the shared asset folder. */
  assets: z.record(z.string(), z.string()).default({}),
  /** Brand-level overrides of product data values, keyed by data key. */
  data: z.record(z.string(), DataScalarSchema).default({}),
  /** Components every document of this brand must bind; enforced, not auto-inserted. */
  mandatoryComponentIds: z.array(IdSchema).default([]),
});
export type BrandPack = z.infer<typeof BrandPackSchema>;

// ---- Queue protocol (Node <-> UXP) ---------------------------------------

/** All job paths are relative to the prototype home folder the UXP panel was granted access to. */
export const UxpJobSchema = z.discriminatedUnion("type", [
  z.object({
    schemaVersion,
    jobId: z.string().min(1),
    type: z.literal("extract-content"),
    inputIndd: z.string().min(1),
    outputJson: z.string().min(1),
  }),
  z.object({
    schemaVersion,
    jobId: z.string().min(1),
    type: z.literal("compose-document"),
    template: z.string().min(1),
    bundle: z.string().min(1),
    outputDir: z.string().min(1),
  }),
]);
export type UxpJob = z.infer<typeof UxpJobSchema>;
export type ExtractContentJob = Extract<UxpJob, { type: "extract-content" }>;
export type ComposeDocumentJob = Extract<UxpJob, { type: "compose-document" }>;

export const UxpChecksSchema = z.object({
  overset: z.boolean(),
  missingLinks: z.array(z.string()),
  missingFonts: z.array(z.string()),
  preflightErrors: z.array(z.string()),
});
export type UxpChecks = z.infer<typeof UxpChecksSchema>;

export const UxpResultSchema = z.object({
  schemaVersion,
  jobId: z.string().min(1),
  status: z.enum(["completed", "failed"]),
  outputs: z.array(z.string()),
  checks: UxpChecksSchema,
  error: z.string().optional(),
  notes: z.array(z.string()).optional(),
});
export type UxpResult = z.infer<typeof UxpResultSchema>;

export const CLEAN_CHECKS: UxpChecks = { overset: false, missingLinks: [], missingFonts: [], preflightErrors: [] };

// ---- Resolved bundle (input to compose-document) -------------------------

export const ResolvedBindingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), target: z.string(), componentId: IdSchema, blocks: z.array(ComponentBlockSchema) }),
  z.object({ kind: z.literal("data"), target: z.string(), key: IdSchema, value: z.string(), valueType: DataValueTypeSchema }),
  z.object({ kind: z.literal("asset"), target: z.string(), assetId: z.string(), path: z.string() }),
]);
export type ResolvedBinding = z.infer<typeof ResolvedBindingSchema>;

export const ResolvedDocumentBundleSchema = z.object({
  schemaVersion,
  documentId: IdSchema,
  brandId: IdSchema,
  brandName: z.string(),
  archetype: ArchetypeSchema,
  templateId: z.string(),
  /** Template path relative to the prototype home. */
  template: z.string(),
  outputBaseName: z.string(),
  bindings: z.array(ResolvedBindingSchema),
  swatches: z.record(z.string(), SwatchSchema),
  styleMap: z.record(z.string(), z.string()),
  formFields: z.array(FormFieldSchema),
  output: OutputOptionsSchema,
});
export type ResolvedDocumentBundle = z.infer<typeof ResolvedDocumentBundleSchema>;

// ---- Release evidence -----------------------------------------------------

export const ReleaseFileSchema = z.object({
  path: z.string(),
  sha256: z.string(),
  size: z.number().int().nonnegative(),
  storageId: z.string().optional(),
  version: z.string().optional(),
});
export type ReleaseFile = z.infer<typeof ReleaseFileSchema>;

export const OutputKindSchema = z.enum(["indd", "print-pdf", "interactive-pdf", "bundle"]);
export type OutputKind = z.infer<typeof OutputKindSchema>;

export const ReleaseOutputSchema = z.object({
  documentId: IdSchema,
  brandId: IdSchema,
  kind: OutputKindSchema,
  path: z.string(),
  sha256: z.string(),
  size: z.number().int().nonnegative(),
  storageId: z.string().optional(),
});
export type ReleaseOutput = z.infer<typeof ReleaseOutputSchema>;

export const OutputSelectionSchema = z.object({
  documentId: IdSchema,
  brandId: IdSchema,
  rebuilt: z.boolean(),
  reasons: z.array(z.string()),
});
export type OutputSelection = z.infer<typeof OutputSelectionSchema>;

export const TargetChecksSchema = UxpChecksSchema.extend({ documentId: IdSchema, brandId: IdSchema });
export type TargetChecks = z.infer<typeof TargetChecksSchema>;

export const StorageModeSchema = z.enum(["frameio", "local"]);
export type StorageMode = z.infer<typeof StorageModeSchema>;
export const CompositionModeSchema = z.enum(["uxp", "dry-run", "firefly"]);
export type CompositionMode = z.infer<typeof CompositionModeSchema>;

export const ReleaseManifestSchema = z.object({
  schemaVersion,
  releaseId: z.string(),
  requestId: z.string(),
  requestFolder: z.string(),
  createdAt: z.string(),
  applicationVersion: z.string(),
  storageMode: StorageModeSchema,
  compositionMode: CompositionModeSchema,
  sourceFiles: z.array(ReleaseFileSchema),
  /** Input reference (component:id, data:key, asset:path, template:name, brand:id, manifest:id) to content hash. */
  inputs: z.record(z.string(), z.string()),
  changedInputs: z.array(z.string()),
  firstRun: z.boolean(),
  outputSelection: z.array(OutputSelectionSchema),
  outputs: z.array(ReleaseOutputSchema),
  checks: z.array(TargetChecksSchema),
  validation: z.object({ status: z.enum(["passed", "failed"]), errors: z.array(z.string()) }),
  status: z.enum(["completed", "failed"]),
  /** Deterministic hash over inputs, selection, output hashes and validation. Excludes ids and timestamps. */
  releaseHash: z.string(),
});
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;

export const FailureRecordSchema = z.object({
  schemaVersion,
  requestId: z.string(),
  requestFolder: z.string(),
  failedAt: z.string(),
  stage: z.string(),
  message: z.string(),
  details: z.array(z.string()),
});
export type FailureRecord = z.infer<typeof FailureRecordSchema>;

// ---- Parsing helper -------------------------------------------------------

export class ContractError extends Error {
  readonly issues: string[];

  constructor(label: string, issues: string[]) {
    super(`${label}: ${issues.join("; ")}`);
    this.name = "ContractError";
    this.issues = issues;
  }
}

/** Parse `value` with `schema`; throw a ContractError listing every issue with its path. */
export function parseWithSchema<T extends z.ZodType>(schema: T, value: unknown, label: string): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const issues = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map((part) => String(part)).join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
  throw new ContractError(label, issues);
}
