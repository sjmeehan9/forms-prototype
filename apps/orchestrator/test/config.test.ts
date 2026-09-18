import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, parseEnvFile, requireFrameioCredentials } from "../src/config.js";
import { tempDir } from "./helpers.js";

describe("configuration", () => {
  it("parses env files leniently", () => {
    expect(parseEnvFile('# comment\nA=1\nB="two"\nC=\'three\'\nD=\n\nE = spaced = value\n')).toEqual({ A: "1", B: "two", C: "three", D: "", E: "spaced = value" });
  });

  it("applies defaults and precedence without secrets", async () => {
    const rootDir = await tempDir();
    await writeFile(path.join(rootDir, ".env.local"), "STORAGE_MODE=local\nPOLL_INTERVAL_MS=250\nFRAMEIO_CLIENT_ID=\n", "utf8");
    const config = await loadConfig({ rootDir, overrides: { COMPOSITION_MODE: "dry-run" } });
    expect(config.storageMode).toBe("local");
    expect(config.compositionMode).toBe("dry-run");
    expect(config.pollIntervalMs).toBe(250);
    expect(config.uxpJobTimeoutMs).toBe(120000);
    expect(config.home).toBe(path.join(rootDir, ".prototype"));
    expect(config.localStorageRoot).toBe(path.join(rootDir, ".prototype", "local-frameio"));
    expect(config.frameio.redirectUri).toBe("https://localhost:4319/oauth/callback");
    expect(() => requireFrameioCredentials(config)).toThrow(/FRAMEIO_CLIENT_ID/);
  });

  it("rejects invalid modes", async () => {
    const rootDir = await tempDir();
    await expect(loadConfig({ rootDir, overrides: { STORAGE_MODE: "cloud" } })).rejects.toThrow(/invalid configuration/);
  });
});
