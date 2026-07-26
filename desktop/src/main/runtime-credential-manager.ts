import {
  runtimeCredentialSecretRef,
  type DesktopCredentialStore,
  type DesktopDeviceIdentity,
  type RuntimeAccessCredential,
} from "./desktop-credential-store";

export interface RuntimeCredentialTarget {
  baseUrl: string;
  deviceIdentity: DesktopDeviceIdentity;
  isLocal: boolean;
  managedHosted: boolean;
  runtimeId: string;
}

export interface RefreshRuntimeCredentialRequest {
  baseUrl: string;
  deviceIdentity: DesktopDeviceIdentity;
  isLocal: boolean;
  managedHosted: boolean;
  runtimeId: string;
}

export interface ControlPlaneRuntimeCredentialClient {
  refreshRuntimeCredential(
    request: RefreshRuntimeCredentialRequest,
  ): Promise<RuntimeAccessCredential>;
}

export class ControlPlaneRuntimeCredentialUnavailableError extends Error {
  constructor() {
    super("control-plane runtime credential refresh client is not configured");
    this.name = "ControlPlaneRuntimeCredentialUnavailableError";
  }
}

export class UnconfiguredControlPlaneRuntimeCredentialClient implements ControlPlaneRuntimeCredentialClient {
  async refreshRuntimeCredential(): Promise<RuntimeAccessCredential> {
    throw new ControlPlaneRuntimeCredentialUnavailableError();
  }
}

export interface RuntimeCredentialManagerOptions {
  clock?: () => Date;
  localRuntimeCredentialClient?: ControlPlaneRuntimeCredentialClient;
  refreshSkewMs?: number;
}

const defaultRefreshSkewMs = 30_000;

export class RuntimeCredentialManager {
  private readonly clock: () => Date;
  private readonly localRuntimeCredentialClient: ControlPlaneRuntimeCredentialClient;
  private readonly refreshSkewMs: number;
  private readonly refreshes = new Map<string, Promise<RuntimeAccessCredential>>();

  constructor(
    private readonly store: DesktopCredentialStore,
    private readonly controlPlane: ControlPlaneRuntimeCredentialClient,
    options: RuntimeCredentialManagerOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.localRuntimeCredentialClient = options.localRuntimeCredentialClient ?? controlPlane;
    this.refreshSkewMs = options.refreshSkewMs ?? defaultRefreshSkewMs;
  }

  async currentRuntimeCredential(
    target: RuntimeCredentialTarget,
  ): Promise<RuntimeAccessCredential> {
    const ref = runtimeCredentialSecretRef({
      deviceId: target.deviceIdentity.deviceId,
      runtimeId: target.runtimeId,
    });
    const cached = await this.store.getRuntimeCredential(ref);
    if (cached && !this.shouldRefresh(cached)) {
      return cached;
    }
    const existingRefresh = this.refreshes.get(ref);
    if (existingRefresh) {
      return existingRefresh;
    }
    const refresh = this.refreshRuntimeCredential(target);
    this.refreshes.set(ref, refresh);
    try {
      return await refresh;
    } finally {
      this.refreshes.delete(ref);
    }
  }

  async clearRuntimeCredential(target: RuntimeCredentialTarget): Promise<void> {
    await this.store.deleteRuntimeCredential(
      runtimeCredentialSecretRef({
        deviceId: target.deviceIdentity.deviceId,
        runtimeId: target.runtimeId,
      }),
    );
  }

  async cacheRuntimeCredential(
    target: RuntimeCredentialTarget,
    credential: RuntimeAccessCredential,
  ): Promise<void> {
    validateIssuedCredential(target, credential);
    if (this.shouldRefresh(credential)) {
      throw new Error("credential issuer returned an expired runtime credential");
    }
    const expectedRef = runtimeCredentialSecretRef({
      deviceId: target.deviceIdentity.deviceId,
      runtimeId: target.runtimeId,
    });
    const storedRef = await this.store.setRuntimeCredential(credential);
    if (storedRef !== expectedRef) {
      throw new Error("credential issuer returned a runtime credential for the wrong target");
    }
  }

  private shouldRefresh(credential: RuntimeAccessCredential): boolean {
    return Date.parse(credential.expiresAt) <= this.clock().getTime() + this.refreshSkewMs;
  }

  private async refreshRuntimeCredential(
    target: RuntimeCredentialTarget,
  ): Promise<RuntimeAccessCredential> {
    const client = target.isLocal ? this.localRuntimeCredentialClient : this.controlPlane;
    const credential = await client.refreshRuntimeCredential({
      baseUrl: target.baseUrl,
      deviceIdentity: target.deviceIdentity,
      isLocal: target.isLocal,
      managedHosted: target.managedHosted,
      runtimeId: target.runtimeId,
    });
    await this.cacheRuntimeCredential(target, credential);
    return credential;
  }
}

function validateIssuedCredential(
  target: RuntimeCredentialTarget,
  credential: RuntimeAccessCredential,
): void {
  if (credential.runtimeId !== target.runtimeId) {
    throw new Error("control plane returned a runtime credential for a different runtime");
  }
  if (credential.deviceId !== target.deviceIdentity.deviceId) {
    throw new Error("control plane returned a runtime credential for a different device");
  }
  if (credential.token.trim() === "") {
    throw new Error("control plane returned an empty runtime credential");
  }
  if (Number.isNaN(Date.parse(credential.expiresAt))) {
    throw new Error("control plane returned a runtime credential with an invalid expiry");
  }
}
