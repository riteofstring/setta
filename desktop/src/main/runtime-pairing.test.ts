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
  test("rejects runtime metadata outside the generated contract", async () => {
    await expect(
      verifyRuntimeConnection({
        authToken: "runtime_credential",
        baseUrl: "http://100.64.0.12:7345/",
        expectedProtocolVersion: backendProtocolVersion,
        expectedRuntimeId: "runtime_expected",
        fetchImpl: async (input) =>
          input.pathname === "/runtime/info"
            ? jsonResponse({
                ...runtimeInfo("runtime_expected", backendProtocolVersion),
                unsupportedField: true,
              })
            : jsonResponse({ devices: [] }),
      }),
    ).rejects.toMatchObject({ reason: "unreachable" } satisfies Partial<RuntimeConnectionError>);
  });

  test("verifies runtime id and authenticated runtime credential", async () => {
    const calls: string[] = [];
    const authorizations: string[] = [];
    const fetchImpl: BackendFetch = async (input, init) => {
      calls.push(input.toString());
      authorizations.push(new Headers(init.headers).get("Authorization") ?? "");
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
    expect(authorizations).toEqual(["Bearer runtime_credential", "Bearer runtime_credential"]);
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
            code: "unauthorized",
            message: "missing or invalid device token",
            operationApplied: false,
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
    protocolVersion,
    runtimeId,
    featureSet: {
      features: ["device_pairing_url", "runtime_web_app", "setup_attestation", "web_push"],
      version: 1,
    },
    diagnostics: runtimeDiagnostics(),
  };
}

function runtimeDiagnostics() {
  return {
    settaRelease: {
      status: "unavailable",
      runtimeVersion: "test",
      metadataPresent: false,
      metadataValid: false,
      installedVersion: "",
      reasonCode: "test",
    },
    codex: {
      status: "unavailable",
      binary: { status: "unavailable", command: "codex", present: false, reasonCode: "test" },
      authentication: {
        status: "unavailable",
        accountStatus: "",
        accountType: "",
        requiresOpenaiAuth: false,
        loginStatus: "",
        reasonCode: "test",
      },
    },
    workloadLease: {
      status: "unavailable",
      configured: false,
      leaseName: "setta-agent",
      active: false,
      startedAt: "",
      expiresAt: "",
      reasonCode: "test",
    },
    policy: {
      status: "unavailable",
      configured: false,
      present: false,
      schemaVersion: 0,
      ruleCount: 0,
      reasonCode: "test",
    },
    diskSpace: {
      status: "unavailable",
      availableMib: 0,
      totalMib: 0,
      minimumFreeMib: 0,
      reasonCode: "test",
    },
    protectedState: {
      status: "unavailable",
      present: false,
      directory: false,
      ownerOnlyWritable: false,
      reasonCode: "test",
    },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
