import { expect, test, type Page } from "@playwright/test";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const FRONTEND_ORIGIN = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
).origin;

type SessionMetadata = {
  id: string;
  host: string;
  port: number;
  secretPath: string;
  startedAt: string;
};

type OriginTestServer = {
  origin: string;
  close: () => Promise<void>;
};

function base64UrlEncode(data: Buffer): string {
  return data
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  ) {
    return "local";
  }
  return normalized;
}

function readBackendSessionMetadata(backendOrigin: string): SessionMetadata {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error(
      "Missing SETTA_WORKSPACE_ROOT for bootstrap launcher origin test token minting.",
    );
  }

  const backendUrl = new URL(backendOrigin);
  const backendPort = Number(backendUrl.port);
  if (!Number.isFinite(backendPort) || backendPort <= 0) {
    throw new Error(`Invalid SETTA_BACKEND_ORIGIN: ${backendOrigin}`);
  }
  const backendHostname = normalizeHostname(backendUrl.hostname);

  const sessionsRoot = path.join(
    workspaceRoot.replace(/\/+$/, ""),
    "setta_files",
    "runtime",
    "sessions",
  );
  const dirents = fs.readdirSync(sessionsRoot, { withFileTypes: true });
  const matches: SessionMetadata[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const metadataPath = path.join(sessionsRoot, dirent.name, "session.json");
    if (!fs.existsSync(metadataPath)) {
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    } catch {
      continue;
    }
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const record = raw as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.host !== "string" ||
      typeof record.secretPath !== "string" ||
      typeof record.startedAt !== "string"
    ) {
      continue;
    }
    if (typeof record.port !== "number") {
      continue;
    }
    if (record.port !== backendPort) {
      continue;
    }
    if (normalizeHostname(record.host) !== backendHostname) {
      continue;
    }
    matches.push({
      id: record.id,
      host: record.host,
      port: record.port,
      secretPath: record.secretPath,
      startedAt: record.startedAt,
    });
  }

  if (!matches.length) {
    throw new Error(
      `Unable to locate backend session metadata in ${sessionsRoot} for ${backendOrigin}`,
    );
  }
  matches.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return matches[0];
}

function mintBootstrapToken(backendOrigin: string): string {
  const metadata = readBackendSessionMetadata(backendOrigin);
  const secret = fs.readFileSync(metadata.secretPath);
  const ttlSeconds = 60 * 10;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const nonce = base64UrlEncode(crypto.randomBytes(16));
  const payloadJson = JSON.stringify({ exp, nonce, sessionId: metadata.id }, [
    "exp",
    "nonce",
    "sessionId",
  ]);
  const payloadBytes = Buffer.from(payloadJson, "utf-8");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadBytes)
    .digest();
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(signature)}`;
}

function mintLauncherOriginProof(
  backendOrigin: string,
  launcherOrigin: string,
): string {
  const metadata = readBackendSessionMetadata(backendOrigin);
  const secret = fs.readFileSync(metadata.secretPath);
  const payloadBytes = Buffer.from(
    `${metadata.id}\n${launcherOrigin}`,
    "utf-8",
  );
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadBytes)
    .digest();
  return base64UrlEncode(signature);
}

async function clearLauncherOrigin(page: Page): Promise<void> {
  const scratch = await page.context().newPage();
  await scratch.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap`, {
    waitUntil: "domcontentloaded",
  });
  await scratch.evaluate(() => {
    localStorage.removeItem("setta.launcherOrigin");
    sessionStorage.removeItem("setta.launcherOrigin");
  });
  await scratch.close();
}

async function startOriginTestServer(): Promise<OriginTestServer> {
  return await new Promise((resolve, reject) => {
    const server = http.createServer((_request, response) => {
      response.statusCode = 200;
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<!doctype html><title>Setta Origin Test</title>ready");
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate origin test server port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

test("bootstrap launcher origin ignores non-http(s) values", async ({
  page,
}) => {
  await clearLauncherOrigin(page);

  const raw = "javascript:alert(1)";
  const token = mintBootstrapToken(BACKEND_ORIGIN);
  const consumeResponse = page.waitForResponse((res) => {
    try {
      const url = new URL(res.url());
      return (
        url.origin === BACKEND_ORIGIN &&
        url.pathname === "/__setta__/bootstrap/consume"
      );
    } catch {
      return false;
    }
  });
  const url =
    `${BACKEND_ORIGIN}/__setta__/bootstrap` +
    `#token=${encodeURIComponent(token)}&lo=${encodeURIComponent(raw)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  expect((await consumeResponse).status()).toBe(200);
  await page.waitForURL(`${FRONTEND_ORIGIN}/**`, {
    waitUntil: "domcontentloaded",
  });
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap`, {
    waitUntil: "domcontentloaded",
  });

  const stored = await page.evaluate(() => ({
    local: localStorage.getItem("setta.launcherOrigin"),
    session: sessionStorage.getItem("setta.launcherOrigin"),
  }));
  expect(stored.local).toBeNull();
  expect(stored.session).toBeNull();
});

test("bootstrap launcher origin stores http(s) origin", async ({ page }) => {
  await clearLauncherOrigin(page);

  const raw = "https://127.0.0.1:4242";
  const proof = mintLauncherOriginProof(BACKEND_ORIGIN, raw);
  const token = mintBootstrapToken(BACKEND_ORIGIN);
  const consumeResponse = page.waitForResponse((res) => {
    try {
      const url = new URL(res.url());
      return (
        url.origin === BACKEND_ORIGIN &&
        url.pathname === "/__setta__/bootstrap/consume"
      );
    } catch {
      return false;
    }
  });
  const url =
    `${BACKEND_ORIGIN}/__setta__/bootstrap` +
    `#token=${encodeURIComponent(token)}&lo=${encodeURIComponent(raw)}&lop=${encodeURIComponent(proof)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  expect((await consumeResponse).status()).toBe(200);
  await page.waitForURL(`${FRONTEND_ORIGIN}/**`, {
    waitUntil: "domcontentloaded",
  });
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap`, {
    waitUntil: "domcontentloaded",
  });

  const stored = await page.evaluate(() => ({
    local: localStorage.getItem("setta.launcherOrigin"),
    session: sessionStorage.getItem("setta.launcherOrigin"),
  }));
  expect(stored.local).toBeNull();
  expect(stored.session).toBe("https://127.0.0.1:4242");
});

test("bootstrap launcher origin ignores invalid proof values", async ({
  page,
}) => {
  await clearLauncherOrigin(page);

  const raw = "http://127.0.0.1:4242";
  const token = mintBootstrapToken(BACKEND_ORIGIN);
  const consumeResponse = page.waitForResponse((res) => {
    try {
      const url = new URL(res.url());
      return (
        url.origin === BACKEND_ORIGIN &&
        url.pathname === "/__setta__/bootstrap/consume"
      );
    } catch {
      return false;
    }
  });
  const url =
    `${BACKEND_ORIGIN}/__setta__/bootstrap` +
    `#token=${encodeURIComponent(token)}&lo=${encodeURIComponent(raw)}&lop=invalid-proof`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  expect((await consumeResponse).status()).toBe(200);
  await page.waitForURL(`${FRONTEND_ORIGIN}/**`, {
    waitUntil: "domcontentloaded",
  });
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap`, {
    waitUntil: "domcontentloaded",
  });

  const stored = await page.evaluate(() => ({
    local: localStorage.getItem("setta.launcherOrigin"),
    session: sessionStorage.getItem("setta.launcherOrigin"),
  }));
  expect(stored.local).toBeNull();
  expect(stored.session).toBeNull();
});

test("bootstrap trusted launcher origin enables dynamic CORS launch-intent calls", async ({
  page,
}) => {
  await clearLauncherOrigin(page);
  const originServer = await startOriginTestServer();
  let secondaryOriginServer: OriginTestServer | null = null;
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT ?? "/tmp/workspace";

  try {
    const authToken = mintBootstrapToken(BACKEND_ORIGIN);
    await page.goto(
      `${BACKEND_ORIGIN}/__setta__/bootstrap#token=${encodeURIComponent(authToken)}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForURL(`${FRONTEND_ORIGIN}/**`, {
      waitUntil: "domcontentloaded",
    });
    await page.goto(originServer.origin, { waitUntil: "domcontentloaded" });

    const beforeTrust = await page.evaluate(
      async ({ backendOrigin, returnUrl, workspaceRootValue }) => {
        try {
          const response = await fetch(
            `${backendOrigin}/api/createWorkspaceLaunchIntent`,
            {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                launchRequest: { workspaceRoot: workspaceRootValue },
                returnUrl,
              }),
            },
          );
          return { ok: true, status: response.status };
        } catch (error) {
          return { ok: false, message: String(error) };
        }
      },
      {
        backendOrigin: BACKEND_ORIGIN,
        returnUrl: `${originServer.origin}/home`,
        workspaceRootValue: workspaceRoot,
      },
    );
    expect(beforeTrust.ok).toBe(false);

    const trustedToken = mintBootstrapToken(BACKEND_ORIGIN);
    const proof = mintLauncherOriginProof(BACKEND_ORIGIN, originServer.origin);
    const consumeResponse = page.waitForResponse((res) => {
      try {
        const url = new URL(res.url());
        return (
          url.origin === BACKEND_ORIGIN &&
          url.pathname === "/__setta__/bootstrap/consume"
        );
      } catch {
        return false;
      }
    });
    await page.goto(
      `${BACKEND_ORIGIN}/__setta__/bootstrap` +
        `#token=${encodeURIComponent(trustedToken)}` +
        `&lo=${encodeURIComponent(originServer.origin)}` +
        `&lop=${encodeURIComponent(proof)}`,
      { waitUntil: "domcontentloaded" },
    );
    expect((await consumeResponse).status()).toBe(200);
    await page.waitForURL(`${FRONTEND_ORIGIN}/**`, {
      waitUntil: "domcontentloaded",
    });
    await page.goto(originServer.origin, { waitUntil: "domcontentloaded" });

    const afterTrust = await page.evaluate(
      async ({ backendOrigin, returnUrl, workspaceRootValue }) => {
        try {
          const response = await fetch(
            `${backendOrigin}/api/createWorkspaceLaunchIntent`,
            {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                launchRequest: { workspaceRoot: workspaceRootValue },
                returnUrl,
              }),
            },
          );
          const payload = (await response.json()) as {
            ok?: boolean;
            launchIntentToken?: string | null;
          };
          return {
            ok: true,
            status: response.status,
            responseOk: payload.ok === true,
            hasToken: typeof payload.launchIntentToken === "string",
          };
        } catch (error) {
          return { ok: false, message: String(error) };
        }
      },
      {
        backendOrigin: BACKEND_ORIGIN,
        returnUrl: `${originServer.origin}/home`,
        workspaceRootValue: workspaceRoot,
      },
    );

    expect(afterTrust.ok).toBe(true);
    expect(afterTrust.status).toBe(200);
    expect(afterTrust.responseOk).toBe(true);
    expect(afterTrust.hasToken).toBe(true);
    secondaryOriginServer = await startOriginTestServer();
    await page.goto(secondaryOriginServer.origin, { waitUntil: "domcontentloaded" });

    const otherOriginAfterTrust = await page.evaluate(
      async ({ backendOrigin, returnUrl, workspaceRootValue }) => {
        try {
          const response = await fetch(
            `${backendOrigin}/api/createWorkspaceLaunchIntent`,
            {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                launchRequest: { workspaceRoot: workspaceRootValue },
                returnUrl,
              }),
            },
          );
          return { ok: true, status: response.status };
        } catch (error) {
          return { ok: false, message: String(error) };
        }
      },
      {
        backendOrigin: BACKEND_ORIGIN,
        returnUrl: `${secondaryOriginServer.origin}/home`,
        workspaceRootValue: workspaceRoot,
      },
    );
    expect(otherOriginAfterTrust.ok).toBe(false);
  } finally {
    await originServer.close();
    if (secondaryOriginServer !== null) {
      await secondaryOriginServer.close();
    }
  }
});
