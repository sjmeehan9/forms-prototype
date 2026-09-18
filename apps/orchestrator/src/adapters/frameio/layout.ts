import path from "node:path";
import { z } from "zod";
import { BuildRequestSourceSchema, parseWithSchema } from "@prototype/contracts";
import { PrototypeError } from "../../domain/models.js";
import { pathExists, readJson, writeJsonAtomic } from "../../util/fs.js";

export const FrameioLayoutSchema = z.object({
  schemaVersion: z.literal(1),
  accountId: z.string(),
  workspaceId: z.string(),
  projectId: z.string(),
  projectName: z.string().optional(),
  rootFolderId: z.string(),
  triggerMode: z.enum(["folder", "metadata"]),
  folders: z.object({
    requests: z.string(),
    states: z.object({
      "Ready to generate": z.string(),
      Generating: z.string(),
      "Ready for review": z.string(),
      Failed: z.string(),
    }),
    sourceContent: z.string(),
    templatesAndAssets: z.string(),
    templates: z.string(),
    brands: z.string(),
    assets: z.string(),
    documentManifests: z.string(),
    generatedVariants: z.string(),
    reviewAndApproved: z.string(),
  }),
  defaults: BuildRequestSourceSchema.partial(),
  capabilities: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string(),
});
export type FrameioLayout = z.infer<typeof FrameioLayoutSchema>;

export function frameioLayoutPath(home: string): string {
  return path.join(home, "frameio.json");
}

export async function loadFrameioLayout(home: string): Promise<FrameioLayout> {
  const file = frameioLayoutPath(home);
  if (!(await pathExists(file))) {
    throw new PrototypeError("config", `Frame.io layout ${file} not found; run npm run bootstrap:frameio first`);
  }
  return parseWithSchema(FrameioLayoutSchema, await readJson(file), "frameio.json");
}

export async function saveFrameioLayout(home: string, layout: FrameioLayout): Promise<void> {
  await writeJsonAtomic(frameioLayoutPath(home), layout);
}
