import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalOrchestrationAdapter, ensureLocalStore, localStateFolders } from "../src/adapters/local/orchestration.js";
import { LocalStorageAdapter } from "../src/adapters/local/storage.js";
import { pathExists } from "../src/util/fs.js";
import { FIXTURE_STORE, tempDir } from "./helpers.js";

async function seededStore(): Promise<{ root: string; storage: LocalStorageAdapter }> {
  const root = path.join(await tempDir(), "store");
  await ensureLocalStore(root, FIXTURE_STORE, { reset: true });
  return { root, storage: new LocalStorageAdapter(root) };
}

describe("LocalStorageAdapter", () => {
  it("lists, uploads, downloads, stats and moves items using relative ids", async () => {
    const { root, storage } = await seededStore();
    const rootChildren = await storage.listChildren("");
    expect(rootChildren.map((i) => i.name)).toEqual(["00 Requests", "01 Source content", "02 Templates and assets", "03 Generated variants", "04 Review and approved"]);

    const scratch = path.join(await tempDir(), "note.txt");
    await writeFile(scratch, "hello", "utf8");
    const folder = await storage.createFolder("03 Generated variants", "rel-test");
    const uploaded = await storage.upload(folder.id, scratch);
    expect(uploaded.id).toBe("03 Generated variants/rel-test/note.txt");
    expect(await pathExists(path.join(root, "03 Generated variants", "rel-test", "note.txt"))).toBe(true);

    const downloaded = await storage.download(uploaded.id, path.join(await tempDir(), "copy.txt"));
    expect(downloaded.sha256).toBe(uploaded.sha256);
    expect((await storage.stat(uploaded.id)).type).toBe("file");

    const other = await storage.createFolder("03 Generated variants", "rel-other");
    const moved = await storage.move(uploaded, other.id);
    expect(moved.id).toBe("03 Generated variants/rel-other/note.txt");
    expect(await pathExists(path.join(root, "03 Generated variants", "rel-test", "note.txt"))).toBe(false);
    expect((await storage.listChildren(other.id)).map((i) => i.name)).toEqual(["note.txt"]);
  });

  it("refuses ids that escape the store", async () => {
    const { storage } = await seededStore();
    await expect(storage.listChildren("../outside")).rejects.toThrow(/escapes/);
  });
});

describe("LocalOrchestrationAdapter", () => {
  it("moves a request through the state folders", async () => {
    const { root, storage } = await seededStore();
    const processed = new Set<string>();
    const orchestration = new LocalOrchestrationAdapter(storage, (id) => processed.has(id));
    const states = localStateFolders();

    const ref = await orchestration.nextRequest();
    expect(ref?.requestId).toBe("req-001-initial-build");
    await orchestration.claim(ref!);
    expect(ref!.folder.parentId).toBe(states.Generating);
    expect(await pathExists(path.join(root, "00 Requests", "Generating", "req-001-initial-build", "request.json"))).toBe(true);
    expect(await orchestration.nextRequest()).toBeNull();

    await orchestration.setState(ref!, "Ready for review");
    expect(await pathExists(path.join(root, "00 Requests", "Ready for review", "req-001-initial-build"))).toBe(true);
    const found = await orchestration.findRequest("req-001-initial-build");
    expect(found?.folder.parentId).toBe(states["Ready for review"]);
    expect(await orchestration.findRequest("nope")).toBeNull();
  });

  it("skips folders already marked as processed", async () => {
    const { storage } = await seededStore();
    const orchestration = new LocalOrchestrationAdapter(storage, () => true);
    expect(await orchestration.nextRequest()).toBeNull();
  });
});
