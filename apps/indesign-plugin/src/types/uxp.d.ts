/**
 * Minimal ambient typings for the UXP host modules. The InDesign DOM is typed loosely on purpose:
 * the human integration check in InDesign is the authority, not the compiler.
 */
declare module "indesign" {
  export const app: any;
  export const IdleEvent: { ON_IDLE: string };
  export const SaveOptions: any;
  export const ExportFormat: any;
  export const FitOptions: any;
  export const ColorModel: any;
  export const ColorSpace: any;
  export const LinkStatus: any;
  export const FontStatus: any;
  export const ListType: any;
  export const MeasurementUnits: any;
  export const AutoSizingTypeEnum: any;
  export const AutoSizingReferenceEnum: any;
  export const CornerOptions: any;
  export const Justification: any;
  export const Capitalization: any;
}

declare module "uxp" {
  export const storage: any;
  export const entrypoints: any;
  export const host: any;
  export const versions: any;
}
