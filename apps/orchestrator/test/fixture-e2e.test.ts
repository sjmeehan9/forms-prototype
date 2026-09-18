import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_FOLDERS } from "../src/adapters/local/orchestration.js";
import { silentLogger } from "../src/log.js";
import { assertExpectedE2E, runFixtureE2E } from "../src/orchestrator/fixture-e2e.js";
import { readJson } from "../src/util/fs.js";
import { FIXTURE_STORE, REPO_ROOT, tempDir } from "./helpers.js";

describe("fixture end-to-end (local store, dry-run composition)", () => {
  it("builds, propagates one data change and fails visibly on a broken manifest", async () => {
    const home = path.join(await tempDir(), "home");
    const report = await runFixtureE2E({ rootDir: REPO_ROOT, fixtureStore: FIXTURE_STORE, home, log: silentLogger });
    await assertExpectedE2E(report);

    const [first, second, third] = report.runs;
    // per brand: form indd+interactive+bundle (3), flyer indd+print+bundle (3), guide indd+print+interactive+bundle (4)
    expect(first?.outputs).toHaveLength((3 + 3 + 4) * 2);
    const secondManifest = (await readJson(path.join(report.storeRoot, LOCAL_FOLDERS.generatedVariants, second!.releaseId!, "release-manifest.json"))) as {
      changedInputs: string[];
      outputSelection: { documentId: string; rebuilt: boolean }[];
      releaseHash: string;
    };
    expect(secondManifest.changedInputs).toEqual(["data:contact.phone"]);
    expect(secondManifest.outputSelection.filter((s) => !s.rebuilt).map((s) => s.documentId)).toEqual(["member-guide", "member-guide"]);
    expect(third?.details).toContainEqual(expect.stringContaining("component missing.clause"));

    const failure = (await readJson(path.join(report.storeRoot, "00 Requests", "Failed", "req-003-broken-manifest", "failure.json"))) as { stage: string; details: string[] };
    expect(failure.stage).toBe("validate");
    expect(failure.details.length).toBeGreaterThan(0);
  });
});
