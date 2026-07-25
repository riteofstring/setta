import { describe, expect, test, vi } from "vitest";

import {
  enrollWithLocalRuntimeIssuer,
  LocalRuntimeCredentialClient,
} from "./local-runtime-credential-client";

describe("local runtime credential client", () => {
  test("enrolls and refreshes through the hosted issuer without changing authority shape", async () => {
    const requests: Array<{ body: unknown; path: string }> = [];
    const fetchImpl = vi.fn(async (input: URL, init?: RequestInit) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        path: input.pathname,
      });
      if (input.pathname === "/local-credentials/enroll") {
        return jsonResponse({
          deviceId: "device_test",
          deviceSecret: "device_secret",
          protocolVersion: 10,
          runtimeCredential: {
            deviceId: "device_test",
            expiresAt: "2026-07-16T12:01:00.000Z",
            runtimeId: "runtime_test",
            token: "signed_first",
          },
          runtimeId: "runtime_test",
          userId: "user_test",
        });
      }
      return jsonResponse({
        deviceId: "device_test",
        expiresAt: "2026-07-16T12:02:00.000Z",
        runtimeId: "runtime_test",
        token: "signed_refreshed",
      });
    });
    const enrollment = await enrollWithLocalRuntimeIssuer({
      clientDisplayName: "Setta Desktop (test)",
      fetchImpl,
      pairing: {
        baseUrl: "http://127.0.0.1:41000/",
        pairingToken: "one_time_pairing_token",
        runtimeId: "runtime_test",
      },
    });
    const client = new LocalRuntimeCredentialClient(fetchImpl);
    const refreshed = await client.refreshRuntimeCredential({
      baseUrl: "http://127.0.0.1:41000/",
      deviceIdentity: enrollment.deviceIdentity,
      isLocal: true,
      runtimeId: enrollment.runtimeId,
    });

    expect(enrollment.runtimeCredential.token).toBe("signed_first");
    expect(refreshed.token).toBe("signed_refreshed");
    expect(requests).toEqual([
      {
        body: {
          clientDisplayName: "Setta Desktop (test)",
          pairingToken: "one_time_pairing_token",
        },
        path: "/local-credentials/enroll",
      },
      {
        body: {
          deviceId: "device_test",
          deviceSecret: "device_secret",
          runtimeId: "runtime_test",
        },
        path: "/local-credentials/refresh",
      },
    ]);
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
