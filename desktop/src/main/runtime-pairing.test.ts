import type { BackendFetch } from "@shared/backend-runtime";
import { backendProtocolVersion } from "@generated/backend";
import { describe, expect, test } from "vitest";

import {
  completePairing,
  createDevicePairing,
  parsePairingURL,
  validateRemoteRuntimeBaseURL,
  verifyRuntimeConnection,
} from "./runtime-pairing";
import type { RuntimeConnectionError } from "./runtime-pairing";

describe("runtime pairing URL parsing", () => {
  test("parses setta pairing URLs and normalizes HTTP runtime origins", () => {
    expect(
      parsePairingURL(
        "setta://pair?rt=runtime_remote&tok=token_pair&url=http%3A%2F%2Fmagic.tail.ts.net%3A7345",
      ),
    ).toEqual({
      baseUrl: "http://magic.tail.ts.net:7345/",
      pairingToken: "token_pair",
      runtimeId: "runtime_remote",
    });
  });

  test("parses phone pairing URLs with token in the fragment", () => {
    expect(parsePairingURL("https://magic.tail.ts.net/#pair=token_pair")).toEqual({
      baseUrl: "https://magic.tail.ts.net/",
      pairingToken: "token_pair",
      runtimeId: null,
    });
  });

  test("accepts https origins and rejects path-bearing runtime URLs", () => {
    expect(validateRemoteRuntimeBaseURL("https://magic.tail.ts.net:7345")).toBe(
      "https://magic.tail.ts.net:7345/",
    );
    expect(() => validateRemoteRuntimeBaseURL("http://magic.tail.ts.net:7345/api")).toThrow(
      "runtime URL must not include a path",
    );
  });

  test("rejects malformed phone pairing URLs", () => {
    expect(() => parsePairingURL("https://magic.tail.ts.net/#token_pair")).toThrow(
      "pairing URL is missing pair fragment",
    );
    expect(() => parsePairingURL("https://magic.example.com/#pair=token_pair")).toThrow(
      "pairing URL must use an official Tailscale ts.net hostname",
    );
    expect(() => parsePairingURL("https://magic.tail.ts.net/path#pair=token_pair")).toThrow(
      "pairing URL must not include a path",
    );
  });
});

describe("runtime pairing completion", () => {
  test("classifies invalid or expired pairing tokens", async () => {
    const parsed = parsePairingURL(
      "setta://pair?rt=runtime_remote&tok=token_pair&url=http%3A%2F%2F100.64.0.12%3A7345",
    );

    await expect(
      completePairing(parsed, "Setta Desktop", async () =>
        jsonResponse(
          {
            error: {
              activeExecution: null,
              code: "invalid_pairing_token",
              message: "pairing token is invalid, expired, or already used",
            },
          },
          401,
        ),
      ),
    ).rejects.toMatchObject({ reason: "invalid_pairing_token" });
  });

  test("rejects pairing runtime_id mismatches", async () => {
    const parsed = parsePairingURL(
      "setta://pair?rt=runtime_expected&tok=token_pair&url=http%3A%2F%2F100.64.0.12%3A7345",
    );

    await expect(
      completePairing(parsed, "Setta Desktop", async () =>
        jsonResponse({
          deviceId: "device_api",
          deviceToken: "device_token",
          protocolVersion: backendProtocolVersion,
          runtimeId: "runtime_actual",
        }),
      ),
    ).rejects.toMatchObject({ reason: "runtime_id_mismatch" });
  });

  test("allows phone pairing URLs without a runtime id", async () => {
    const parsed = parsePairingURL("https://runtime.tailnet.ts.net/#pair=token_pair");

    await expect(
      completePairing(parsed, "Setta Phone", async () =>
        jsonResponse({
          deviceId: "device_phone",
          deviceToken: "device_token",
          protocolVersion: backendProtocolVersion,
          runtimeId: "runtime_actual",
        }),
      ),
    ).resolves.toMatchObject({ runtimeId: "runtime_actual" });
  });
});

describe("runtime device pairing creation", () => {
  test("requests an authenticated phone pairing URL for ts.net runtimes", async () => {
    const calls: Array<{ authorization: string | null; body: unknown; path: string }> = [];
    const pairing = await createDevicePairing({
      baseUrl: "https://runtime.tailnet.ts.net/",
      deviceToken: "device_token",
      fetchImpl: async (input, init = {}) => {
        calls.push({
          authorization: new Headers(init.headers).get("Authorization"),
          body: JSON.parse(String(init.body)),
          path: input.pathname,
        });
        return jsonResponse({
          expiresAt: "2026-07-07T10:10:00Z",
          pairingUrl: "https://runtime.tailnet.ts.net/#pair=token_pair",
        });
      },
    });

    expect(pairing.pairingUrl).toBe("https://runtime.tailnet.ts.net/#pair=token_pair");
    expect(calls).toEqual([
      {
        authorization: "Bearer device_token",
        body: { runtimeBaseUrl: "https://runtime.tailnet.ts.net/" },
        path: "/pairing/create-device",
      },
    ]);
  });

  test("requires the active runtime to use its ts.net HTTPS address", async () => {
    await expect(
      createDevicePairing({
        baseUrl: "http://100.64.0.12:7345/",
        deviceToken: "device_token",
        fetchImpl: async () => jsonResponse({}),
      }),
    ).rejects.toThrow("Pair another device requires the runtime to be connected");
  });
});

describe("runtime connection verification", () => {
  test("verifies runtime id and authenticated device token", async () => {
    const calls: string[] = [];
    const fetchImpl: BackendFetch = async (input) => {
      calls.push(input.toString());
      if (input.pathname === "/runtime/info") {
        return jsonResponse(runtimeInfo("runtime_expected", backendProtocolVersion));
      }
      return jsonResponse({ devices: [] });
    };

    await expect(
      verifyRuntimeConnection({
        baseUrl: "http://100.64.0.12:7345/",
        deviceToken: "device_token",
        expectedRuntimeId: "runtime_expected",
        fetchImpl,
      }),
    ).resolves.toMatchObject({ runtimeId: "runtime_expected" });
    expect(calls).toEqual([
      "http://100.64.0.12:7345/runtime/info",
      "http://100.64.0.12:7345/devices/list",
    ]);
  });

  test("marks older protocol versions incompatible", async () => {
    const fetchImpl: BackendFetch = async (input) => {
      if (input.pathname === "/runtime/info") {
        return jsonResponse(runtimeInfo("runtime_expected", backendProtocolVersion - 1));
      }
      return jsonResponse({ devices: [] });
    };

    await expect(
      verifyRuntimeConnection({
        baseUrl: "http://100.64.0.12:7345/",
        deviceToken: "device_token",
        expectedRuntimeId: "runtime_expected",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ reason: "incompatible" } satisfies Partial<RuntimeConnectionError>);
  });

  test("marks missing runtime feature identity incompatible", async () => {
    const fetchImpl: BackendFetch = async (input) => {
      if (input.pathname === "/runtime/info") {
        return jsonResponse(legacyRuntimeInfo("runtime_expected", backendProtocolVersion));
      }
      return jsonResponse({ devices: [] });
    };

    await expect(
      verifyRuntimeConnection({
        baseUrl: "http://100.64.0.12:7345/",
        deviceToken: "device_token",
        expectedRuntimeId: "runtime_expected",
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      details: { protocolVersion: backendProtocolVersion },
      reason: "incompatible",
    } satisfies Partial<RuntimeConnectionError>);
  });

  test("blocks different runtimes at the stored address", async () => {
    await expect(
      verifyRuntimeConnection({
        baseUrl: "http://100.64.0.12:7345/",
        deviceToken: "device_token",
        expectedRuntimeId: "runtime_expected",
        fetchImpl: async () => jsonResponse(runtimeInfo("runtime_actual", backendProtocolVersion)),
      }),
    ).rejects.toMatchObject({ reason: "mismatched" } satisfies Partial<RuntimeConnectionError>);
  });

  test("marks unsupported protocol versions incompatible", async () => {
    await expect(
      verifyRuntimeConnection({
        baseUrl: "http://100.64.0.12:7345/",
        deviceToken: "device_token",
        expectedRuntimeId: "runtime_expected",
        fetchImpl: async () => jsonResponse(runtimeInfo("runtime_expected", 99)),
      }),
    ).rejects.toMatchObject({ reason: "incompatible" } satisfies Partial<RuntimeConnectionError>);
  });

  test("marks 401 token verification as revoked", async () => {
    const fetchImpl: BackendFetch = async (input) => {
      if (input.pathname === "/runtime/info") {
        return jsonResponse(runtimeInfo("runtime_expected", backendProtocolVersion));
      }
      return jsonResponse(
        {
          error: {
            activeExecution: null,
            code: "unauthorized",
            message: "missing or invalid device token",
          },
        },
        401,
      );
    };

    await expect(
      verifyRuntimeConnection({
        baseUrl: "http://100.64.0.12:7345/",
        deviceToken: "device_token",
        expectedRuntimeId: "runtime_expected",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ reason: "revoked" } satisfies Partial<RuntimeConnectionError>);
  });
});

function runtimeInfo(runtimeId: string, protocolVersion: number) {
  return {
    backendName: "setta-backend",
    backendVersion: "test",
    displayName: "Remote",
    featureSet: runtimeFeatureSet(),
    infrastructureProvider: {
      displayName: "Unknown provider",
      iconUrl: "",
      id: "unknown",
    },
    protocolVersion,
    runtimeId,
    vapidPublicKey: "test-vapid-public-key",
  };
}

function runtimeFeatureSet() {
  return {
    features: ["device_pairing_url", "runtime_web_app", "web_push"],
    version: 1,
  };
}

function legacyRuntimeInfo(runtimeId: string, protocolVersion: number) {
  return {
    backendName: "setta-backend",
    backendVersion: "test",
    displayName: "Remote",
    protocolVersion,
    runtimeId,
    vapidPublicKey: "test-vapid-public-key",
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
