import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CompositionModeSchema, StorageModeSchema, type CompositionMode, type StorageMode } from "@prototype/contracts";
import { PrototypeError } from "./domain/models.js";
import { pathExists } from "./util/fs.js";

const EnvSchema = z.object({
  FRAMEIO_CLIENT_ID: z.string().optional(),
  FRAMEIO_CLIENT_SECRET: z.string().optional(),
  FRAMEIO_REDIRECT_URI: z.string().default("https://localhost:4319/oauth/callback"),
  FRAMEIO_ACCOUNT_ID: z.string().optional(),
  FRAMEIO_WORKSPACE_ID: z.string().optional(),
  FRAMEIO_PROJECT_ID: z.string().optional(),
  STORAGE_MODE: StorageModeSchema.default("frameio"),
  TRIGGER_MODE: z.enum(["folder", "metadata"]).default("folder"),
  COMPOSITION_MODE: CompositionModeSchema.default("uxp"),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  UXP_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  PROTOTYPE_HOME: z.string().default(".prototype"),
  LOCAL_STORAGE_ROOT: z.string().optional(),
  FIXTURE_STORE: z.string().default("fixtures/frameio"),
  TLS_CERT_FILE: z.string().optional(),
  TLS_KEY_FILE: z.string().optional(),
});

export const CONFIG_KEYS = Object.keys(EnvSchema.shape);

export type AppConfig = {
  rootDir: string;
  /** Absolute path of the folder the InDesign panel is granted access to. */
  home: string;
  storageMode: StorageMode;
  triggerMode: "folder" | "metadata";
  compositionMode: CompositionMode;
  pollIntervalMs: number;
  uxpJobTimeoutMs: number;
  localStorageRoot: string;
  fixtureStore: string;
  tlsCertFile: string;
  tlsKeyFile: string;
  frameio: {
    clientId?: string;
    clientSecret?: string;
    redirectUri: string;
    accountId?: string;
    workspaceId?: string;
    projectId?: string;
  };
};

/** Minimal KEY=VALUE parser for .env.local; comments and blank lines are ignored, quotes are stripped. */
export function parseEnvFile(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

export type LoadConfigOptions = { rootDir?: string; overrides?: Record<string, string | undefined> };

/** Precedence: explicit overrides, then process environment, then .env.local in the repository root. */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<AppConfig> {
  const rootDir = options.rootDir ?? process.cwd();
  const envFile = path.join(rootDir, ".env.local");
  const fileVars = (await pathExists(envFile)) ? parseEnvFile(await readFile(envFile, "utf8")) : {};
  const merged: Record<string, string> = {};
  for (const key of CONFIG_KEYS) {
    const value = options.overrides?.[key] ?? process.env[key] ?? fileVars[key];
    if (value !== undefined && value !== "") {
      merged[key] = value;
    }
  }
  const parsed = EnvSchema.safeParse(merged);
  if (!parsed.success) {
    throw new PrototypeError(
      "config",
      "invalid configuration",
      parsed.error.issues.map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`),
    );
  }
  const env = parsed.data;
  const home = path.resolve(rootDir, env.PROTOTYPE_HOME);
  return {
    rootDir,
    home,
    storageMode: env.STORAGE_MODE,
    triggerMode: env.TRIGGER_MODE,
    compositionMode: env.COMPOSITION_MODE,
    pollIntervalMs: env.POLL_INTERVAL_MS,
    uxpJobTimeoutMs: env.UXP_JOB_TIMEOUT_MS,
    localStorageRoot: env.LOCAL_STORAGE_ROOT ? path.resolve(rootDir, env.LOCAL_STORAGE_ROOT) : path.join(home, "local-frameio"),
    fixtureStore: path.resolve(rootDir, env.FIXTURE_STORE),
    tlsCertFile: env.TLS_CERT_FILE ? path.resolve(rootDir, env.TLS_CERT_FILE) : path.join(home, "tls", "localhost.pem"),
    tlsKeyFile: env.TLS_KEY_FILE ? path.resolve(rootDir, env.TLS_KEY_FILE) : path.join(home, "tls", "localhost-key.pem"),
    frameio: {
      clientId: env.FRAMEIO_CLIENT_ID,
      clientSecret: env.FRAMEIO_CLIENT_SECRET,
      redirectUri: env.FRAMEIO_REDIRECT_URI,
      accountId: env.FRAMEIO_ACCOUNT_ID,
      workspaceId: env.FRAMEIO_WORKSPACE_ID,
      projectId: env.FRAMEIO_PROJECT_ID,
    },
  };
}

export function requireFrameioCredentials(config: AppConfig): { clientId: string; clientSecret: string; redirectUri: string } {
  const { clientId, clientSecret, redirectUri } = config.frameio;
  if (!clientId || !clientSecret) {
    throw new PrototypeError("config", "FRAMEIO_CLIENT_ID and FRAMEIO_CLIENT_SECRET must be set in .env.local");
  }
  return { clientId, clientSecret, redirectUri };
}
