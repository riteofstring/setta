import { describe, expect, test } from "vitest";

import { MemoryCredentialSecretStore } from "./credential-secret-store";
import {
  DesktopCredentialStore,
  runtimeCredentialSecretRef,
  type DesktopDeviceIdentity,
  type RuntimeAccessCredential,
} from "./desktop-credential-store";
import {
  ControlPlaneRuntimeCredentialUnavailableError,
  RuntimeCredentialManager,
  UnconfiguredControlPlaneRuntimeCredentialClient,
  type ControlPlaneRuntimeCredentialClient,
  type RefreshRuntimeCredentialRequest,
} from "./runtime-credential-manager";

describe("RuntimeCredentialManager", () => {
  test("returns cached credentials before expiry and refreshes after expiry", async () => {
    const credentialStore = new DesktopCredentialStore(new MemoryCredentialSecretStore());
    const controlPlane = new FakeControlPlaneRuntimeCredentialClient([
      credential("credential_first", "2026-07-16T12:01:00.000Z"),
      credential("credential_second", "2026-07-16T12:03:00.000Z"),
    ]);
    let now = new Date("2026-07-16T12:00:00.000Z");
    const manager = new RuntimeCredentialManager(credentialStore, controlPlane, {
      clock: () => now,
      refreshSkewMs: 5_000,
    });
    const target = runtimeTarget();

    await expect(manager.currentRuntimeCredential(target)).resolves.toMatchObject({
      token: "credential_first",
    });
    await expect(manager.currentRuntimeCredential(target)).resolves.toMatchObject({
      token: "credential_first",
    });

    now = new Date("2026-07-16T12:00:56.000Z");
    await expect(manager.currentRuntimeCredential(target)).resolves.toMatchObject({
      token: "credential_second",
    });

    expect(controlPlane.requests).toHaveLength(2);
    await expect(
      credentialStore.getRuntimeCredential(
        runtimeCredentialSecretRef({ deviceId: "device_test", runtimeId: "runtime_test" }),
      ),
    ).resolves.toMatchObject({ token: "credential_second" });
  });

  test("rejects credentials issued for a different device", async () => {
    const manager = new RuntimeCredentialManager(
      new DesktopCredentialStore(new MemoryCredentialSecretStore()),
      new FakeControlPlaneRuntimeCredentialClient([
        {
          ...credential("credential_wrong", "2026-07-16T12:01:00.000Z"),
          deviceId: "device_other",
        },
      ]),
      {
        clock: () => new Date("2026-07-16T12:00:00.000Z"),
        refreshSkewMs: 0,
      },
    );

    await expect(manager.currentRuntimeCredential(runtimeTarget())).rejects.toThrow(
      "different device",
    );
  });

  test("fails loudly for a remote runtime without a configured control-plane client", async () => {
    const manager = new RuntimeCredentialManager(
      new DesktopCredentialStore(new MemoryCredentialSecretStore()),
      new UnconfiguredControlPlaneRuntimeCredentialClient(),
    );

    await expect(manager.currentRuntimeCredential(runtimeTarget())).rejects.toBeInstanceOf(
      ControlPlaneRuntimeCredentialUnavailableError,
    );
  });
});

class FakeControlPlaneRuntimeCredentialClient implements ControlPlaneRuntimeCredentialClient {
  readonly requests: RefreshRuntimeCredentialRequest[] = [];
  private nextCredentialIndex = 0;

  constructor(private readonly credentials: RuntimeAccessCredential[]) {}

  async refreshRuntimeCredential(
    request: RefreshRuntimeCredentialRequest,
  ): Promise<RuntimeAccessCredential> {
    this.requests.push(request);
    const credential = this.credentials[this.nextCredentialIndex];
    if (!credential) {
      throw new Error("missing fake credential");
    }
    this.nextCredentialIndex += 1;
    return credential;
  }
}

function runtimeTarget() {
  return {
    baseUrl: "https://runtime.setta.test/",
    deviceIdentity: deviceIdentity(),
    isLocal: false,
    managedHosted: true,
    runtimeId: "runtime_test",
  };
}

function credential(token: string, expiresAt: string): RuntimeAccessCredential {
  return {
    deviceId: "device_test",
    expiresAt,
    runtimeId: "runtime_test",
    token,
  };
}

function deviceIdentity(): DesktopDeviceIdentity {
  return {
    deviceId: "device_test",
    secret: "device_secret",
    userId: "user_test",
  };
}
