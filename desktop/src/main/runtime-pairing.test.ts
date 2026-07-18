import type { BackendFetch } from "@shared/backend-runtime";
import { backendProtocolVersion } from "@generated/backend";
import { describe, expect, test } from "vitest";

import {
  parsePairingURL,
  RuntimePairingError,
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

  test("rejects https and path-bearing runtime URLs", () => {
    expect(() => validateRemoteRuntimeBaseURL("https://magic.tail.ts.net:7345")).toThrow(
      RuntimePairingError,
    );
    expect(() => validateRemoteRuntimeBaseURL("http://magic.tail.ts.net:7345/api")).toThrow(
      "runtime URL must not include a path",
    );
  });
});

describe("runtime connection verification", () => {
  test("accepts current runtime metadata while backend contract generation is deferred", async () => {
    const currentRuntimeInfo = {
      ...runtimeInfo("runtime_expected", 11),
      diagnostics: { health: "healthy" },
      featureSet: { protocolVersion: 1 },
    };

    await expect(
      verifyRuntimeConnection({
        authToken: "runtime_credential",
        baseUrl: "http://100.64.0.12:7345/",
        expectedProtocolVersion: 11,
        expectedRuntimeId: "runtime_expected",
        fetchImpl: async (input) =>
          input.pathname === "/runtime/info"
            ? jsonResponse(currentRuntimeInfo)
            : jsonResponse({ devices: [] }),
      }),
    ).resolves.toMatchObject({ runtimeId: "runtime_expected" });
  });

  test("verifies runtime id and authenticated runtime credential", async () => {
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
        authToken: "runtime_credential",
        baseUrl: "http://100.64.0.12:7345/",
        expectedProtocolVersion: backendProtocolVersion,
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
        return jsonResponse(legacyRuntimeInfo("runtime_expected", backendProtocolVersion - 1));
      }
      return jsonResponse({ devices: [] });
    };

    await expect(
      verifyRuntimeConnection({
        authToken: "runtime_credential",
        baseUrl: "http://100.64.0.12:7345/",
        expectedProtocolVersion: backendProtocolVersion,
        expectedRuntimeId: "runtime_expected",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ reason: "incompatible" } satisfies Partial<RuntimeConnectionError>);
  });

  test("blocks different runtimes at the stored address", async () => {
    await expect(
      verifyRuntimeConnection({
        authToken: "runtime_credential",
        baseUrl: "http://100.64.0.12:7345/",
        expectedProtocolVersion: backendProtocolVersion,
        expectedRuntimeId: "runtime_expected",
        fetchImpl: async () => jsonResponse(runtimeInfo("runtime_actual", backendProtocolVersion)),
      }),
    ).rejects.toMatchObject({ reason: "mismatched" } satisfies Partial<RuntimeConnectionError>);
  });

  test("marks unsupported protocol versions incompatible", async () => {
    await expect(
      verifyRuntimeConnection({
        authToken: "runtime_credential",
        baseUrl: "http://100.64.0.12:7345/",
        expectedProtocolVersion: backendProtocolVersion,
        expectedRuntimeId: "runtime_expected",
        fetchImpl: async () => jsonResponse(runtimeInfo("runtime_expected", 99)),
      }),
    ).rejects.toMatchObject({ reason: "incompatible" } satisfies Partial<RuntimeConnectionError>);
  });

  test("marks 401 credential verification as revoked", async () => {
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
        authToken: "runtime_credential",
        baseUrl: "http://100.64.0.12:7345/",
        expectedProtocolVersion: backendProtocolVersion,
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
