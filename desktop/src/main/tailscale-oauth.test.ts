import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { MemoryRuntimeSecretStore } from "./runtime-secret-store";
import { TailscaleOAuthService } from "./tailscale-oauth";

describe("TailscaleOAuthService", () => {
  test("returns setup guidance with manual auth-key fallback intact", async () => {
    const service = newService({
      readLocalTailnetStatus: async () => ({
        dnsName: "laptop.tailnet.ts.net",
        error: null,
        loginName: "alice@example.com",
        status: "joined",
        tailnetName: "tailnet.ts.net",
      }),
    });

    const guide = await service.setupGuide();

    expect(guide.adminConsoleUrl).toContain("oauth");
    expect(guide.requiredScope).toBe("auth_keys");
    expect(guide.requiredTag).toBe("tag:setta-runtime");
    expect(guide.aclSnippet).toContain("tag:setta-runtime");
    expect(guide.runtimeIsolationPolicySnippet).toContain("7345");
    expect(guide.manualAuthKeyFallback.description).toContain("Manual paste remains available");
    expect(guide.localTailnet).toMatchObject({
      loginName: "alice@example.com",
      status: "joined",
    });
    expect(guide.oauth.configured).toBe(false);
  });

  test("stores only the OAuth client secret in the runtime secret store", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-tailscale-oauth-"));
    const secrets = new MemoryRuntimeSecretStore();
    const service = newService({ secrets, userDataDir });

    const status = await service.saveCredentials({
      clientId: "oauth-client-abcdef123456",
      clientSecret: "oauth-secret-very-sensitive",
      tailnet: "example.com",
    });

    expect(status).toMatchObject({
      clientIdPreview: "oauth-...3456",
      configured: true,
      expectedTag: "tag:setta-runtime",
      tailnet: "example.com",
    });
    await expect(secrets.getSecret("tailscale-oauth-client-secret:v1")).resolves.toBe(
      "oauth-secret-very-sensitive",
    );
    const raw = await readFile(join(userDataDir, "tailscale-oauth.json"), "utf8");
    expect(raw).toContain("oauth-client-abcdef123456");
    expect(raw).not.toContain("oauth-secret-very-sensitive");
    const mode = (await stat(join(userDataDir, "tailscale-oauth.json"))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("validates tag ownership by minting and revoking a scoped test auth key", async () => {
    const calls: FetchCall[] = [];
    const service = newService({
      fetchImpl: queuedFetch(calls, [
        jsonResponse({ access_token: "access_validate", token_type: "Bearer" }),
        jsonResponse({
          expires: "2026-07-07T12:05:00Z",
          id: "k-validation",
          key: "tskey-auth-validation",
        }),
        jsonResponse({ access_token: "access_revoke", token_type: "Bearer" }),
        new Response(null, { status: 204 }),
      ]),
    });
    await service.saveCredentials({
      clientId: "oauth-client-validation",
      clientSecret: "oauth-secret-validation",
    });

    const result = await service.validateCredentials();

    expect(result).toMatchObject({
      code: "tailscale_oauth_valid",
      keyId: "k-validation",
      ok: true,
      revoked: true,
      tag: "tag:setta-runtime",
    });
    expect(calls.map((call) => [call.method, call.url.pathname])).toEqual([
      ["POST", "/api/v2/oauth/token"],
      ["POST", "/api/v2/tailnet/-/keys"],
      ["POST", "/api/v2/oauth/token"],
      ["DELETE", "/api/v2/tailnet/-/keys/k-validation"],
    ]);
    expect(calls[0]?.body).toBe(
      "client_id=oauth-client-validation&client_secret=oauth-secret-validation&scope=auth_keys&tags=tag%3Asetta-runtime",
    );
    const createPayload = JSON.parse(calls[1]?.body ?? "{}");
    expect(createPayload).toMatchObject({
      capabilities: {
        devices: {
          create: {
            ephemeral: false,
            preauthorized: true,
            reusable: false,
            tags: ["tag:setta-runtime"],
          },
        },
      },
      description: "Setta OAuth validation for tag:setta-runtime",
      expirySeconds: 300,
    });
    expect(calls[1]?.headers.get("authorization")).toBe("Bearer access_validate");
    await expect(service.status()).resolves.toMatchObject({
      lastValidationError: null,
      lastValidationStatus: "valid",
    });
  });

  test("mints per-runtime one-off preauthorized auth keys with the expected tag", async () => {
    const calls: FetchCall[] = [];
    const service = newService({
      fetchImpl: queuedFetch(calls, [
        jsonResponse({ access_token: "access_mint", token_type: "Bearer" }),
        jsonResponse({
          expires: "2026-07-07T13:00:00Z",
          id: "k-runtime",
          key: "tskey-auth-runtime",
        }),
      ]),
    });
    await service.saveCredentials({
      clientId: "oauth-client-runtime",
      clientSecret: "oauth-secret-runtime",
    });

    const result = await service.mintAuthKey({ runtimeName: "setta-worker" });

    expect(result).toMatchObject({
      authKey: "tskey-auth-runtime",
      ephemeral: false,
      expiresAt: "2026-07-07T13:00:00Z",
      expirySeconds: 3600,
      keyId: "k-runtime",
      preauthorized: true,
      reusable: false,
      tags: ["tag:setta-runtime"],
    });
    expect(calls).toHaveLength(2);
    const createPayload = JSON.parse(calls[1]?.body ?? "{}");
    expect(createPayload.capabilities.devices.create).toEqual({
      ephemeral: false,
      preauthorized: true,
      reusable: false,
      tags: ["tag:setta-runtime"],
    });
    expect(createPayload.description).toBe("Setta runtime setta-worker (tag:setta-runtime)");
  });

  test("reports permission failures as non-admin or tag ownership setup errors", async () => {
    const service = newService({
      fetchImpl: queuedFetch(
        [],
        [
          jsonResponse({ access_token: "access_denied", token_type: "Bearer" }),
          jsonResponse({ message: "requested tags are invalid or not permitted" }, 403),
        ],
      ),
    });
    await service.saveCredentials({
      clientId: "oauth-client-denied",
      clientSecret: "oauth-secret-denied",
    });

    const result = await service.validateCredentials();

    expect(result).toMatchObject({
      code: "tailscale_oauth_permission_denied",
      ok: false,
      revoked: false,
      tag: "tag:setta-runtime",
    });
    expect(result.message).toContain("manual auth-key paste");
    await expect(service.status()).resolves.toMatchObject({
      lastValidationStatus: "failed",
    });
  });
});

interface NewServiceOptions {
  fetchImpl?: (input: URL, init: RequestInit) => Promise<Response>;
  readLocalTailnetStatus?: TailscaleOAuthServiceConstructorOptions["readLocalTailnetStatus"];
  secrets?: MemoryRuntimeSecretStore;
  userDataDir?: string;
}

type TailscaleOAuthServiceConstructorOptions = ConstructorParameters<
  typeof TailscaleOAuthService
>[0];

interface FetchCall {
  body: string;
  headers: Headers;
  method: string;
  url: URL;
}

function newService(options: NewServiceOptions = {}): TailscaleOAuthService {
  return new TailscaleOAuthService({
    fetchImpl:
      options.fetchImpl ??
      (async () => {
        throw new Error("unexpected Tailscale API call");
      }),
    now: () => new Date("2026-07-07T12:00:00.000Z"),
    readLocalTailnetStatus:
      options.readLocalTailnetStatus ??
      (async () => ({
        dnsName: null,
        error: "tailscale CLI was not found in PATH",
        loginName: null,
        status: "not_found",
        tailnetName: null,
      })),
    secretStore: options.secrets ?? new MemoryRuntimeSecretStore(),
    userDataDir:
      options.userDataDir ??
      join(tmpdir(), `setta-tailscale-oauth-test-${process.pid}-${Math.random()}`),
  });
}

function queuedFetch(
  calls: FetchCall[],
  responses: Response[],
): (input: URL, init: RequestInit) => Promise<Response> {
  return async (input, init) => {
    calls.push({
      body: requestBodyText(init.body),
      headers: new Headers(init.headers),
      method: init.method ?? "GET",
      url: input,
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`unexpected fetch call to ${input.toString()}`);
    }
    return response;
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function requestBodyText(body: BodyInit | null | undefined): string {
  if (body === undefined || body === null) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  throw new Error(`unsupported test request body: ${Object.prototype.toString.call(body)}`);
}
