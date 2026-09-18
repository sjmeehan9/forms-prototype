import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { PrototypeError, errorMessage } from "../../domain/models.js";
import type { Logger } from "../../log.js";
import { ensureDir, pathExists } from "../../util/fs.js";

export const IMS_AUTHORIZE_URL = "https://ims-na1.adobelogin.com/ims/authorize/v2";
export const IMS_TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3";
export const DEFAULT_SCOPES = "openid email profile offline_access additional_info.roles";

export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string; scopes?: string };

export type StoredTokens = {
  schemaVersion: 1;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: string;
  obtainedAt: string;
  scope?: string;
};

export function authFilePath(home: string): string {
  return path.join(home, "auth.json");
}

export async function loadTokens(home: string): Promise<StoredTokens | null> {
  const file = authFilePath(home);
  if (!(await pathExists(file))) {
    return null;
  }
  const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<StoredTokens>;
  if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string" || typeof parsed.expiresAt !== "string") {
    throw new PrototypeError("auth", `${file} is not a valid token file; delete it and run npm run auth:frameio again`);
  }
  return parsed as StoredTokens;
}

export async function saveTokens(home: string, tokens: StoredTokens): Promise<void> {
  await ensureDir(home);
  const file = authFilePath(home);
  await writeFile(file, `${JSON.stringify(tokens, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(file, 0o600);
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function requestTokens(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(IMS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params).toString(),
  });
  const text = await response.text();
  let json: TokenResponse;
  try {
    json = JSON.parse(text) as TokenResponse;
  } catch {
    throw new PrototypeError("auth", `Adobe IMS returned a non-JSON response (HTTP ${response.status})`);
  }
  if (!response.ok || json.error || typeof json.access_token !== "string") {
    throw new PrototypeError("auth", `Adobe IMS token request failed (HTTP ${response.status}): ${json.error ?? "unknown"} ${json.error_description ?? ""}`.trim());
  }
  return json;
}

function toStoredTokens(json: TokenResponse, previousRefreshToken?: string): StoredTokens {
  const now = new Date();
  const refreshToken = json.refresh_token ?? previousRefreshToken;
  if (!refreshToken) {
    throw new PrototypeError("auth", "Adobe IMS did not return a refresh token; the offline_access scope must be granted");
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    schemaVersion: 1,
    accessToken: json.access_token as string,
    refreshToken,
    tokenType: json.token_type ?? "bearer",
    expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    obtainedAt: now.toISOString(),
    scope: json.scope,
  };
}

export async function exchangeCode(config: OAuthConfig, code: string): Promise<StoredTokens> {
  return toStoredTokens(
    await requestTokens({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  );
}

export async function refreshTokens(config: OAuthConfig, tokens: StoredTokens): Promise<StoredTokens> {
  return toStoredTokens(
    await requestTokens({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refreshToken,
    }),
    tokens.refreshToken,
  );
}

/** Returns a function that yields a valid access token, refreshing and persisting it when it is about to expire. */
export function createTokenProvider(config: OAuthConfig, home: string, log: Logger): () => Promise<string> {
  let cached: StoredTokens | null = null;
  return async () => {
    cached ??= await loadTokens(home);
    if (!cached) {
      throw new PrototypeError("auth", "no Frame.io session found; run npm run auth:frameio");
    }
    if (Date.parse(cached.expiresAt) - Date.now() < 60_000) {
      log.info("refreshing the Frame.io access token");
      cached = await refreshTokens(config, cached);
      await saveTokens(home, cached);
    }
    return cached.accessToken;
  };
}

export type TlsMaterial = { cert: Buffer; key: Buffer };

/** Load the local HTTPS certificate, creating one with mkcert (trusted) or openssl (self-signed) when absent. */
export async function ensureTlsCertificate(certFile: string, keyFile: string, log: Logger): Promise<TlsMaterial> {
  if (!(await pathExists(certFile)) || !(await pathExists(keyFile))) {
    await ensureDir(path.dirname(certFile));
    const mkcert = spawnSync("mkcert", ["-cert-file", certFile, "-key-file", keyFile, "localhost", "127.0.0.1", "::1"], { encoding: "utf8" });
    if (mkcert.status === 0) {
      log.info(`created a locally trusted certificate with mkcert at ${certFile}`);
    } else {
      log.warn("mkcert is not available; creating a self-signed certificate with openssl (the browser will warn once)");
      const openssl = spawnSync(
        "openssl",
        ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "365", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"],
        { encoding: "utf8" },
      );
      if (openssl.status !== 0) {
        throw new PrototypeError("auth", "could not create a TLS certificate for the OAuth callback; install mkcert (brew install mkcert && mkcert -install) and retry", [openssl.stderr ?? ""]);
      }
    }
  }
  return { cert: await readFile(certFile), key: await readFile(keyFile) };
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui;margin:3rem"><h1>${title}</h1><p>${body}</p></body></html>`;
}

export type LoginOptions = { tls: TlsMaterial; openBrowser: boolean; log: Logger; timeoutMs?: number };

/** Authorization-code flow with a temporary HTTPS listener on the registered localhost redirect URI. */
export function runLoginFlow(config: OAuthConfig, options: LoginOptions): Promise<StoredTokens> {
  const redirect = new URL(config.redirectUri);
  if (redirect.protocol !== "https:") {
    throw new PrototypeError("auth", "FRAMEIO_REDIRECT_URI must use https; Adobe rejects http redirect URIs even for localhost");
  }
  const port = Number(redirect.port || 443);
  const callbackPath = redirect.pathname;
  const state = randomBytes(16).toString("hex");
  const authorizeUrl = new URL(IMS_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("scope", config.scopes ?? DEFAULT_SCOPES);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);
  const { log } = options;

  return new Promise<StoredTokens>((resolve, reject) => {
    const servers: Server[] = [];
    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      for (const server of servers) {
        server.close();
        server.closeAllConnections();
      }
      settle();
    };
    const timer = setTimeout(
      () => finish(() => reject(new PrototypeError("auth", "timed out waiting for the browser sign-in to complete"))),
      options.timeoutMs ?? 300_000,
    );

    const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
      const url = new URL(request.url ?? "/", `https://${redirect.host}`);
      if (url.pathname !== callbackPath) {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("not found");
        return;
      }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      if (error || !code) {
        const description = url.searchParams.get("error_description") ?? "";
        response.writeHead(400, { "Content-Type": "text/html" });
        response.end(htmlPage("Sign-in failed", `${error ?? "missing authorization code"} ${description}`));
        finish(() => reject(new PrototypeError("auth", `Adobe sign-in failed: ${error ?? "missing authorization code"} ${description}`.trim())));
        return;
      }
      if (url.searchParams.get("state") !== state) {
        response.writeHead(400, { "Content-Type": "text/html" });
        response.end(htmlPage("Sign-in failed", "The state value did not match; start the sign-in again."));
        finish(() => reject(new PrototypeError("auth", "OAuth state mismatch; start the sign-in again")));
        return;
      }
      try {
        const tokens = await exchangeCode(config, code);
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(htmlPage("Signed in to Frame.io", "You can close this window and return to the terminal."));
        finish(() => resolve(tokens));
      } catch (exchangeError) {
        response.writeHead(500, { "Content-Type": "text/html" });
        response.end(htmlPage("Token exchange failed", errorMessage(exchangeError)));
        finish(() => reject(exchangeError));
      }
    };

    for (const host of ["127.0.0.1", "::1"]) {
      const server = createServer({ cert: options.tls.cert, key: options.tls.key }, (request, response) => {
        void handle(request, response);
      });
      server.on("error", (listenError: Error) => {
        if (host === "::1") {
          log.warn(`IPv6 loopback listener unavailable (${listenError.message}); continuing with IPv4 only`);
        } else {
          finish(() => reject(new PrototypeError("auth", `cannot listen on https://${host}:${port}: ${listenError.message}`)));
        }
      });
      server.listen(port, host, () => {
        log.info(`OAuth callback listening on https://${host === "::1" ? "[::1]" : host}:${port}${callbackPath}`);
      });
      servers.push(server);
    }

    log.info(`Sign in with Adobe at:\n${authorizeUrl.toString()}`);
    if (options.openBrowser && process.platform === "darwin") {
      spawn("open", [authorizeUrl.toString()], { stdio: "ignore", detached: true }).unref();
    }
  });
}
