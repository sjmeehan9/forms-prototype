import { ContractError, type BrandPack, type ComponentRegister, type DataSet, type DocumentManifest } from "@prototype/contracts";
import { compareStrings } from "./hash.js";

export type SourceFile = {
  /** Path relative to the source package root, posix separators. */
  relativePath: string;
  absolutePath: string;
  name: string;
  sha256: string;
  size: number;
  storageId?: string;
  version?: string;
};

export type SourcePackage = {
  rootDir: string;
  contentLibrary: SourceFile;
  data: SourceFile;
  manifests: SourceFile[];
  templates: SourceFile[];
  brands: SourceFile[];
  assets: SourceFile[];
};

export type SourceModel = {
  register: ComponentRegister;
  data: DataSet;
  manifests: DocumentManifest[];
  brands: BrandPack[];
  templates: SourceFile[];
  /** Brand-folder and shared asset files; relativePath starts with `brands/` or `assets/`. */
  assets: SourceFile[];
};

export type OutputTarget = { documentId: string; brandId: string };

export type InputKind = "component" | "data" | "asset" | "template" | "brand" | "manifest";
export type InputRef = string;

export function inputRef(kind: InputKind, id: string): InputRef {
  return `${kind}:${id}`;
}

export function targetKey(target: OutputTarget): string {
  return `${target.documentId}--${target.brandId}`;
}

export function compareTargets(a: OutputTarget, b: OutputTarget): number {
  return compareStrings(targetKey(a), targetKey(b));
}

export function sameTarget(a: OutputTarget, b: OutputTarget): boolean {
  return a.documentId === b.documentId && a.brandId === b.brandId;
}

export type SourceSnapshot = {
  schemaVersion: 1;
  createdAt: string;
  /** Input reference to content hash, keys sorted. */
  inputs: Record<InputRef, string>;
};

export class PrototypeError extends Error {
  readonly stage: string;
  readonly details: string[];

  constructor(stage: string, message: string, details: string[] = []) {
    super(message);
    this.name = "PrototypeError";
    this.stage = stage;
    this.details = details;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorDetails(error: unknown): string[] {
  if (error instanceof PrototypeError) {
    return error.details;
  }
  if (error instanceof ContractError) {
    return error.issues;
  }
  return [];
}

export function errorStage(error: unknown, fallback: string): string {
  return error instanceof PrototypeError ? error.stage : fallback;
}
