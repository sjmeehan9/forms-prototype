import { createTokenProvider } from "../adapters/frameio/auth.js";
import { FrameioClient } from "../adapters/frameio/client.js";
import { loadFrameioLayout } from "../adapters/frameio/layout.js";
import { FrameioStorageAdapter } from "../adapters/frameio/storage.js";
import type { StoredItem } from "../adapters/types.js";
import { requireFrameioCredentials, type AppConfig } from "../config.js";
import { PrototypeError } from "../domain/models.js";
import type { Logger } from "../log.js";

function formatSize(size: number | undefined): string {
  if (size === undefined) {
    return "";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Print the project tree below a folder path given by names, e.g. `03 Generated variants`. */
export async function listFrameio(config: AppConfig, log: Logger, folderPath: string[], maxDepth: number): Promise<string[]> {
  const layout = await loadFrameioLayout(config.home);
  const client = new FrameioClient(createTokenProvider(requireFrameioCredentials(config), config.home, log));
  const storage = new FrameioStorageAdapter(client, layout.accountId, log);

  let current: StoredItem = { id: layout.rootFolderId, name: layout.projectName ?? "project", type: "folder" };
  for (const segment of folderPath) {
    const children = await storage.listChildren(current.id);
    const next = children.find((item) => item.type === "folder" && item.name === segment);
    if (!next) {
      throw new PrototypeError("list", `folder ${segment} was not found under ${current.name}; available: ${children.filter((c) => c.type === "folder").map((c) => c.name).join(", ") || "none"}`);
    }
    current = next;
  }

  const lines: string[] = [`${current.name}/`];
  const walk = async (folder: StoredItem, depth: number, indent: string): Promise<void> => {
    if (depth > maxDepth) {
      return;
    }
    const children = await storage.listChildren(folder.id);
    for (const child of children) {
      if (child.type === "folder") {
        lines.push(`${indent}${child.name}/`);
        await walk(child, depth + 1, `${indent}  `);
      } else {
        lines.push(`${indent}${child.name}  ${formatSize(child.fileSize)}`.trimEnd());
      }
    }
  };
  await walk(current, 1, "  ");
  return lines;
}
