import { reverse } from "node:dns/promises";
import { isIP } from "node:net";

import type {
  CreateDevicePairingResponse,
  RuntimeInfoResponse,
  RuntimeInfrastructureProvider,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import type {
  KnownRuntimeView,
  RuntimeConnectionState,
  RuntimeConnectionStatus,
  RuntimeRegistrySnapshot,
} from "@shared/types";
import {
  emptyKnownRuntimeRegistry,
  removeKnownRuntime,
  upsertKnownRuntime,
  type KnownRuntimeRecord,
  type KnownRuntimeRegistry,
  type KnownRuntimeStore,
} from "./known-runtime-store";
import {
  completePairing,
  createDevicePairing,
  fetchRuntimeInfo,
  parsePairingURL,
  RuntimeConnectionError,
  RuntimePairingError,
  verifyRuntimeConnection,
} from "./runtime-pairing";

export interface ActiveRuntime {
  baseUrl: string;
  deviceToken: string;
  displayName: string;
  isLocal: boolean;
  protocolVersion: number;
  runtimeId: string;
}

export interface RuntimeRegistryHooks {
  activeRuntimeFailed: (state: RuntimeConnectionState) => Promise<void> | void;
  activeRuntimeOffline: (state: RuntimeConnectionState) => Promise<void> | void;
  activeRuntimeOnline: (runtime: ActiveRuntime) => Promise<void> | void;
  beforeRuntimeSwitch: () => Promise<void>;
}

export interface RuntimeRegistryOptions {
  clientDisplayName: () => string;
  fetchImpl: BackendFetch;
  hooks: RuntimeRegistryHooks;
  now?: () => Date;
  onSnapshot: (snapshot: RuntimeRegistrySnapshot) => void;
  resolveRuntimeHostName?: (baseUrl: string) => Promise<string | null>;
  store: KnownRuntimeStore;
}

interface LocalRuntimeInput {
  baseUrl: string;
  deviceToken: string;
}

const initialConnectionState: RuntimeConnectionState = {
  message: "No runtime connected",
  protocolVersion: null,
  runtimeId: null,
  status: "disconnected",
  updatedAt: new Date(0).toISOString(),
};

const unknownRuntimeInfrastructureProvider = {
  displayName: "Unknown provider",
  iconUrl: "",
  id: "unknown",
} satisfies RuntimeInfrastructureProvider;

const legacyGenericRuntimeDisplayName = "Setta Runtime";

const runtimeInfrastructureProviderByHost = [
  {
    provider: {
      displayName: "AWS",
      iconUrl: "https://aws.amazon.com/favicon.ico",
      id: "aws",
    },
    suffixes: ["amazonaws.com", "aws.dev"],
  },
  {
    provider: {
      displayName: "Azure",
      iconUrl: "https://azure.microsoft.com/favicon.ico",
      id: "azure",
    },
    suffixes: ["azure.com", "cloudapp.net"],
  },
  {
    provider: {
      displayName: "Google Cloud",
      iconUrl: "https://cloud.google.com/favicon.ico",
      id: "google-cloud",
    },
    suffixes: ["googleusercontent.com", "googleapis.com"],
  },
  {
    provider: {
      displayName: "Hetzner",
      iconUrl: "https://www.hetzner.com/favicon.ico",
      id: "hetzner",
    },
    suffixes: ["hetzner.com", "your-server.de"],
  },
  {
    provider: {
      displayName: "Paperspace",
      iconUrl: "https://www.paperspace.com/favicon.ico",
      id: "paperspace",
    },
    suffixes: ["paperspace.com", "paperspace.io"],
  },
  {
    provider: {
      displayName: "CodeSandbox",
      iconUrl: "https://codesandbox.io/favicon.ico",
      id: "codesandbox",
    },
    suffixes: ["codesandbox.io", "csb.app"],
  },
] as const satisfies readonly {
  provider: RuntimeInfrastructureProvider;
  suffixes: readonly string[];
}[];

export class RuntimeRegistryController {
  private activeRuntime: ActiveRuntime | null = null;
  private connection = initialConnectionState;
  private operationRunning = false;
  private registry: KnownRuntimeRegistry = emptyKnownRuntimeRegistry();
  private runtimeInfrastructureProviders = new Map<string, RuntimeInfrastructureProvider>();
  private switching = false;

  constructor(private readonly options: RuntimeRegistryOptions) {}

  async load(): Promise<RuntimeRegistrySnapshot> {
    this.registry = await this.options.store.read();
    this.emit();
    return this.snapshot();
  }

  async registerLocalRuntime(input: LocalRuntimeInput): Promise<KnownRuntimeRecord> {
    const info = await fetchRuntimeInfo(input.baseUrl, this.options.fetchImpl);
    this.runtimeInfrastructureProviders.set(info.runtimeId, info.infrastructureProvider);
    const localRuntime: KnownRuntimeRecord = {
      baseUrl: input.baseUrl,
      deviceToken: input.deviceToken,
      displayName: info.displayName,
      isLocal: true,
      lastConnected: null,
      runtimeId: info.runtimeId,
    };
    this.registry = upsertKnownRuntime(this.registry, localRuntime);
    if (this.registry.activeRuntimeId === null) {
      this.registry = { ...this.registry, activeRuntimeId: localRuntime.runtimeId };
    }
    await this.persist();
    this.emit();
    return localRuntime;
  }

  async connectStoredOrLocal(localRuntimeId: string): Promise<RuntimeRegistrySnapshot> {
    const runtimeId = this.registry.activeRuntimeId ?? localRuntimeId;
    const target = this.findKnownRuntime(runtimeId) ?? this.findKnownRuntime(localRuntimeId);
    if (!target) {
      throw new Error("local runtime was not registered");
    }
    const snapshot = await this.connectRuntime(target.runtimeId, { initial: true });
    if (snapshot.connection.status === "connected" || target.runtimeId === localRuntimeId) {
      return snapshot;
    }
    const localTarget = this.findKnownRuntime(localRuntimeId);
    if (!localTarget || localTarget.runtimeId === target.runtimeId) {
      return snapshot;
    }
    return this.connectRuntime(localTarget.runtimeId, { initial: true });
  }

  async addByPairingURL(pairingURL: string): Promise<RuntimeRegistrySnapshot> {
    return this.runExclusive(async () => {
      const parsed = parsePairingURL(pairingURL);
      const paired = await completePairing(
        parsed,
        this.options.clientDisplayName(),
        this.options.fetchImpl,
      );
      const info = await fetchRuntimeInfo(parsed.baseUrl, this.options.fetchImpl);
      if (parsed.runtimeId !== null && info.runtimeId !== parsed.runtimeId) {
        throw new RuntimePairingError(
          "runtime_id_mismatch",
          `runtime info runtime_id ${info.runtimeId} does not match URL runtime_id ${parsed.runtimeId}`,
        );
      }
      if (paired.runtimeId !== info.runtimeId) {
        throw new RuntimePairingError(
          "runtime_id_mismatch",
          `pairing response runtime_id ${paired.runtimeId} does not match runtime info ${info.runtimeId}`,
        );
      }
      const presentation = await this.runtimePresentationFromInfo(
        { baseUrl: parsed.baseUrl, displayName: info.displayName, isLocal: false },
        info,
      );
      this.runtimeInfrastructureProviders.set(info.runtimeId, presentation.infrastructureProvider);
      this.registry = upsertKnownRuntime(this.registry, {
        baseUrl: parsed.baseUrl,
        deviceToken: paired.deviceToken,
        displayName: presentation.displayName,
        isLocal: false,
        lastConnected: null,
        runtimeId: info.runtimeId,
      });
      await this.persist();
      return this.connectRuntime(info.runtimeId, { operationAlreadyHeld: true });
    });
  }

  async createDevicePairing(): Promise<CreateDevicePairingResponse> {
    const active = this.activeRuntime;
    if (!active || this.connection.status !== "connected") {
      throw new Error("Connect to a runtime before pairing another device.");
    }
    return createDevicePairing({
      baseUrl: active.baseUrl,
      deviceToken: active.deviceToken,
      fetchImpl: this.options.fetchImpl,
    });
  }

  async switchToRuntime(runtimeId: string): Promise<RuntimeRegistrySnapshot> {
    return this.runExclusive(() => this.connectRuntime(runtimeId, { operationAlreadyHeld: true }));
  }

  async removeRuntime(runtimeId: string): Promise<RuntimeRegistrySnapshot> {
    return this.runExclusive(async () => {
      const runtime = this.requireKnownRuntime(runtimeId);
      if (runtime.isLocal) {
        throw new Error("Local runtime cannot be removed");
      }
      const wasActive = this.registry.activeRuntimeId === runtimeId;
      this.registry = removeKnownRuntime(this.registry, runtimeId);
      this.runtimeInfrastructureProviders.delete(runtimeId);
      await this.persist();
      if (wasActive) {
        const fallback = this.registry.activeRuntimeId;
        if (fallback) {
          return this.connectRuntime(fallback, { operationAlreadyHeld: true });
        }
        this.activeRuntime = null;
        this.connection = this.connectionState("disconnected", null, "No runtime connected");
      }
      this.emit();
      return this.snapshot();
    });
  }

  async markActiveRuntimeRevoked(): Promise<void> {
    const active = this.activeRuntime;
    if (!active || this.connection.status === "revoked") {
      return;
    }
    this.activeRuntime = null;
    this.connection = this.connectionState(
      "revoked",
      active.runtimeId,
      "Runtime access was revoked; re-pair this device",
      active.protocolVersion,
    );
    this.emit();
    await this.options.hooks.activeRuntimeFailed(this.connection);
  }

  async markActiveRuntimeUnreachable(message: string): Promise<void> {
    const active = this.activeRuntime;
    if (!active) {
      return;
    }
    this.activeRuntime = null;
    this.connection = this.connectionState(
      "unreachable",
      active.runtimeId,
      message,
      active.protocolVersion,
    );
    this.emit();
    await this.options.hooks.activeRuntimeFailed(this.connection);
  }

  currentRuntime(): ActiveRuntime | null {
    return this.activeRuntime;
  }

  list(): KnownRuntimeView[] {
    return this.snapshot().runtimes;
  }

  snapshot(): RuntimeRegistrySnapshot {
    return {
      activeRuntimeId: this.registry.activeRuntimeId,
      connection: this.connection,
      runtimes: this.registry.runtimes.map((runtime) => this.runtimeView(runtime)),
      switching: this.switching,
    };
  }

  private async connectRuntime(
    runtimeId: string,
    options: { initial?: boolean; operationAlreadyHeld?: boolean } = {},
  ): Promise<RuntimeRegistrySnapshot> {
    if (!options.operationAlreadyHeld && this.operationRunning) {
      throw new Error("runtime operation already in progress");
    }
    const run = async () => {
      const target = this.requireKnownRuntime(runtimeId);
      this.switching = true;
      this.registry = { ...this.registry, activeRuntimeId: target.runtimeId };
      this.connection = this.connectionState(
        "connecting",
        target.runtimeId,
        `Connecting to ${runtimePresentationName(target)}`,
      );
      this.emit();
      await this.options.hooks.activeRuntimeOffline(this.connection);
      if (!options.initial) {
        await this.options.hooks.beforeRuntimeSwitch();
      }
      try {
        const info = await verifyRuntimeConnection({
          baseUrl: target.baseUrl,
          deviceToken: target.deviceToken,
          expectedRuntimeId: target.runtimeId,
          fetchImpl: this.options.fetchImpl,
        });
        const presentation = await this.runtimePresentationFromInfo(target, info);
        this.runtimeInfrastructureProviders.set(
          info.runtimeId,
          presentation.infrastructureProvider,
        );
        const connected = this.activeRuntimeFromKnownRuntime(
          target,
          info,
          presentation.displayName,
        );
        this.activeRuntime = connected;
        this.connection = this.connectionState(
          "connected",
          connected.runtimeId,
          `Connected to ${connected.displayName}`,
          connected.protocolVersion,
        );
        this.registry = upsertKnownRuntime(this.registry, {
          ...target,
          displayName: presentation.displayName,
          lastConnected: this.nowISO(),
        });
        this.registry = { ...this.registry, activeRuntimeId: connected.runtimeId };
        await this.persist();
        this.switching = false;
        await this.options.hooks.activeRuntimeOnline(connected);
        this.emit();
        return this.snapshot();
      } catch (error) {
        this.activeRuntime = null;
        this.connection = this.connectionStateFromError(target, error);
        this.switching = false;
        await this.persist();
        this.emit();
        await this.options.hooks.activeRuntimeFailed(this.connection);
        return this.snapshot();
      }
    };
    if (options.operationAlreadyHeld) {
      return run();
    }
    return this.runExclusive(run);
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.operationRunning) {
      throw new Error("runtime operation already in progress");
    }
    this.operationRunning = true;
    try {
      return await operation();
    } finally {
      this.operationRunning = false;
    }
  }

  private activeRuntimeFromKnownRuntime(
    runtime: KnownRuntimeRecord,
    info: RuntimeInfoResponse,
    displayName: string,
  ): ActiveRuntime {
    return {
      baseUrl: runtime.baseUrl,
      deviceToken: runtime.deviceToken,
      displayName,
      isLocal: runtime.isLocal,
      protocolVersion: info.protocolVersion,
      runtimeId: runtime.runtimeId,
    };
  }

  private connectionStateFromError(
    target: KnownRuntimeRecord,
    error: unknown,
  ): RuntimeConnectionState {
    if (error instanceof RuntimeConnectionError) {
      return this.connectionState(
        error.reason,
        target.runtimeId,
        error.message,
        numberDetail(error.details.protocolVersion),
      );
    }
    return this.connectionState(
      "unreachable",
      target.runtimeId,
      error instanceof Error ? error.message : "runtime connection failed",
    );
  }

  private connectionState(
    status: RuntimeConnectionStatus,
    runtimeId: string | null,
    message: string,
    protocolVersion: number | null = null,
  ): RuntimeConnectionState {
    return {
      message,
      protocolVersion,
      runtimeId,
      status,
      updatedAt: this.nowISO(),
    };
  }

  private runtimeView(runtime: KnownRuntimeRecord): KnownRuntimeView {
    const active = runtime.runtimeId === this.registry.activeRuntimeId;
    const activeConnection = active ? this.connection : null;
    return {
      active,
      baseUrl: runtime.baseUrl,
      connectionMessage: activeConnection?.message ?? "Not selected",
      connectionStatus: activeConnection?.status ?? "disconnected",
      displayName: runtimePresentationName(runtime),
      infrastructureProvider:
        this.runtimeInfrastructureProviders.get(runtime.runtimeId) ??
        runtimeInfrastructureProviderFromHost(runtime.baseUrl, null) ??
        unknownRuntimeInfrastructureProvider,
      isLocal: runtime.isLocal,
      lastConnected: runtime.lastConnected,
      runtimeId: runtime.runtimeId,
    };
  }

  private requireKnownRuntime(runtimeId: string): KnownRuntimeRecord {
    const runtime = this.findKnownRuntime(runtimeId);
    if (!runtime) {
      throw new Error(`runtime is not known: ${runtimeId}`);
    }
    return runtime;
  }

  private findKnownRuntime(runtimeId: string): KnownRuntimeRecord | null {
    return this.registry.runtimes.find((runtime) => runtime.runtimeId === runtimeId) ?? null;
  }

  private async persist(): Promise<void> {
    await this.options.store.write(this.registry);
  }

  private emit(): void {
    this.options.onSnapshot(this.snapshot());
  }

  private nowISO(): string {
    return (this.options.now ?? (() => new Date()))().toISOString();
  }

  private async runtimePresentationFromInfo(
    runtime: Pick<KnownRuntimeRecord, "baseUrl" | "displayName" | "isLocal">,
    info: RuntimeInfoResponse,
  ): Promise<{ displayName: string; infrastructureProvider: RuntimeInfrastructureProvider }> {
    if (runtime.isLocal) {
      return {
        displayName: "Local",
        infrastructureProvider: info.infrastructureProvider,
      };
    }
    const resolvedHostName = await this.resolveRuntimeHostName(runtime.baseUrl);
    return {
      displayName: remoteRuntimeDisplayName(runtime.baseUrl, info.displayName, resolvedHostName),
      infrastructureProvider:
        knownRuntimeInfrastructureProvider(info.infrastructureProvider) ??
        runtimeInfrastructureProviderFromHost(runtime.baseUrl, resolvedHostName) ??
        unknownRuntimeInfrastructureProvider,
    };
  }

  private async resolveRuntimeHostName(baseUrl: string): Promise<string | null> {
    if (this.options.resolveRuntimeHostName) {
      return this.options.resolveRuntimeHostName(baseUrl);
    }
    return resolveRuntimeHostName(baseUrl);
  }
}

function runtimePresentationName(
  runtime: Pick<KnownRuntimeRecord, "baseUrl" | "displayName" | "isLocal">,
): string {
  if (runtime.isLocal) {
    return "Local";
  }
  return remoteRuntimeDisplayName(runtime.baseUrl, runtime.displayName, null);
}

function remoteRuntimeDisplayName(
  baseUrl: string,
  displayName: string,
  resolvedHostName: string | null,
): string {
  const trimmedDisplayName = displayName.trim();
  if (!genericRuntimeDisplayName(trimmedDisplayName)) {
    return trimmedDisplayName;
  }
  const hostTitle = runtimeHostTitle(resolvedHostName) ?? runtimeURLHostTitle(baseUrl);
  return hostTitle ?? "Remote runtime";
}

function genericRuntimeDisplayName(displayName: string): boolean {
  return (
    displayName === "" ||
    displayName.toLowerCase() === legacyGenericRuntimeDisplayName.toLowerCase()
  );
}

function runtimeURLHostTitle(baseUrl: string): string | null {
  const hostName = new URL(baseUrl).hostname;
  if (isIP(hostName) !== 0) {
    return null;
  }
  return runtimeHostTitle(hostName);
}

function runtimeHostTitle(hostName: string | null): string | null {
  if (hostName === null) {
    return null;
  }
  const normalized = hostName.trim().replace(/\.$/, "");
  if (normalized === "" || isIP(normalized) !== 0) {
    return null;
  }
  const [firstLabel] = normalized.split(".");
  return firstLabel && firstLabel !== "" ? firstLabel : null;
}

async function resolveRuntimeHostName(baseUrl: string): Promise<string | null> {
  const hostName = new URL(baseUrl).hostname;
  if (isIP(hostName) === 0) {
    return null;
  }
  try {
    const names = await reverse(hostName);
    return names[0] ?? null;
  } catch {
    return null;
  }
}

function knownRuntimeInfrastructureProvider(
  provider: RuntimeInfrastructureProvider,
): RuntimeInfrastructureProvider | null {
  return provider.id === "unknown" ? null : provider;
}

function runtimeInfrastructureProviderFromHost(
  baseUrl: string,
  resolvedHostName: string | null,
): RuntimeInfrastructureProvider | null {
  const candidates = [new URL(baseUrl).hostname, resolvedHostName]
    .filter((candidate): candidate is string => candidate !== null)
    .map((candidate) => candidate.trim().toLowerCase().replace(/\.$/, ""));
  for (const candidate of candidates) {
    const matched = runtimeInfrastructureProviderByHost.find(({ suffixes }) =>
      suffixes.some((suffix) => candidate === suffix || candidate.endsWith(`.${suffix}`)),
    );
    if (matched) {
      return matched.provider;
    }
  }
  return null;
}

function numberDetail(value: string | number | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}
