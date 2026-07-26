import type {
  DestroyDeveloperHostedRuntimeRequest,
  DeveloperHostedRuntimeStatus,
  EnsureDeveloperHostedRuntimeRequest,
} from "@generated/backend";
import { ipcEvents } from "@shared/ipc";
import {
  confirmDeveloperHostedRuntimeConnected,
  destroyDeveloperHostedRuntime,
  ensureDeveloperHostedRuntime,
  finalizeDeveloperHostedRuntimeRemoval,
  readDeveloperHostedRuntimeBootstrap,
  readDeveloperHostedRuntimeStatus,
  streamDeveloperHostedRuntimeStatus,
} from "./developer-hosted-runtime-client";
import type { RuntimeRegistryController } from "./runtime-registry";

export const hostedTestWorkspacePath = "/var/lib/setta/Hosted test workspace";

interface DeveloperHostedRuntimeStatusSender {
  isDestroyed: () => boolean;
  send: (channel: string, status: DeveloperHostedRuntimeStatus) => void;
}

export interface DeveloperHostedRuntimeControllerOptions {
  client?: DeveloperHostedRuntimeClient;
  enabled: boolean;
  hostedWorkspacePath?: string;
  openHostedTestWorkspace: (path: string) => Promise<void>;
  runtimeRegistry: () => Pick<
    RuntimeRegistryController,
    "list" | "registerManagedHostedRuntime" | "removeManagedHostedRuntime"
  >;
  senders: () => DeveloperHostedRuntimeStatusSender[];
  socketPath: () => string;
}

export interface DeveloperHostedRuntimeClient {
  confirmConnected: typeof confirmDeveloperHostedRuntimeConnected;
  destroy: typeof destroyDeveloperHostedRuntime;
  ensure: typeof ensureDeveloperHostedRuntime;
  finalizeRemoval: typeof finalizeDeveloperHostedRuntimeRemoval;
  readBootstrap: typeof readDeveloperHostedRuntimeBootstrap;
  readStatus: typeof readDeveloperHostedRuntimeStatus;
  streamStatus: typeof streamDeveloperHostedRuntimeStatus;
}

const defaultClient: DeveloperHostedRuntimeClient = {
  confirmConnected: confirmDeveloperHostedRuntimeConnected,
  destroy: destroyDeveloperHostedRuntime,
  ensure: ensureDeveloperHostedRuntime,
  finalizeRemoval: finalizeDeveloperHostedRuntimeRemoval,
  readBootstrap: readDeveloperHostedRuntimeBootstrap,
  readStatus: readDeveloperHostedRuntimeStatus,
  streamStatus: streamDeveloperHostedRuntimeStatus,
};

export class DeveloperHostedRuntimeController {
  private activation: Promise<void> | null = null;
  private current: DeveloperHostedRuntimeStatus | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private removal: Promise<void> | null = null;
  private streamAbort: AbortController | null = null;

  constructor(private readonly options: DeveloperHostedRuntimeControllerOptions) {}

  async load(): Promise<DeveloperHostedRuntimeStatus | null> {
    if (!this.options.enabled) {
      return null;
    }
    const status = await this.client.readStatus(this.options.socketPath());
    this.current = status;
    if (status) {
      this.emit(status);
      this.scheduleExpiryRefresh(status);
      await this.handleActionableStatus(status);
      this.follow(this.current ?? status);
    }
    return this.current;
  }

  status(): DeveloperHostedRuntimeStatus | null {
    return this.current;
  }

  available(): boolean {
    return this.options.enabled;
  }

  async ensure(
    request: EnsureDeveloperHostedRuntimeRequest,
  ): Promise<DeveloperHostedRuntimeStatus> {
    this.requireEnabled();
    const status = await this.client.ensure(this.options.socketPath(), request);
    this.update(status);
    await this.handleActionableStatus(status);
    this.follow(this.current ?? status);
    return this.current ?? status;
  }

  async destroy(
    request: DestroyDeveloperHostedRuntimeRequest,
  ): Promise<DeveloperHostedRuntimeStatus> {
    this.requireEnabled();
    const status = await this.client.destroy(this.options.socketPath(), request);
    this.update(status);
    await this.handleActionableStatus(status);
    this.follow(this.current ?? status);
    return this.current ?? status;
  }

  stop(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    this.streamAbort?.abort();
    this.streamAbort = null;
  }

  private follow(status: DeveloperHostedRuntimeStatus): void {
    if (status.terminalOutcome !== null) {
      return;
    }
    this.streamAbort?.abort();
    const abort = new AbortController();
    this.streamAbort = abort;
    void this.consume(status.operationId, status.cursor, abort);
  }

  private async consume(
    operationId: string,
    cursor: string,
    abort: AbortController,
  ): Promise<void> {
    try {
      for await (const status of this.client.streamStatus(
        this.options.socketPath(),
        operationId,
        cursor,
        abort.signal,
      )) {
        if (this.streamAbort !== abort) {
          return;
        }
        this.update(status);
        await this.handleActionableStatus(status);
      }
    } catch {
      if (!abort.signal.aborted && this.current) {
        this.update({
          ...this.current,
          phase: "needs_attention",
          reasonCode: "connection_failed",
          retryable: true,
          terminalOutcome: null,
        });
      }
    } finally {
      if (this.streamAbort === abort) {
        this.streamAbort = null;
      }
    }
  }

  private async handleActionableStatus(status: DeveloperHostedRuntimeStatus): Promise<void> {
    if (status.phase === "connecting" && status.operationKind === "ensure") {
      if (!this.activation) {
        this.activation = this.activate().finally(() => {
          this.activation = null;
        });
      }
      await this.activation;
      return;
    }
    if (status.phase === "removed") {
      if (!this.removal) {
        this.removal = this.finishRemoval(status).finally(() => {
          this.removal = null;
        });
      }
      await this.removal;
    }
  }

  private async activate(): Promise<void> {
    const bootstrap = await this.client.readBootstrap(this.options.socketPath());
    const snapshot = await this.options.runtimeRegistry().registerManagedHostedRuntime({
      baseUrl: bootstrap.baseUrl,
      deviceIdentity: {
        deviceId: bootstrap.deviceId,
        secret: bootstrap.deviceSecret,
        userId: bootstrap.userId,
      },
      expiresAt: bootstrap.expiresAt,
      protocolVersion: bootstrap.protocolVersion,
      runtimeId: bootstrap.runtimeId,
      token: bootstrap.token,
    });
    if (
      snapshot.activeRuntimeId !== bootstrap.runtimeId ||
      snapshot.connection.status !== "connected"
    ) {
      throw new Error("hosted runtime did not reach the connected registry state");
    }
    const connected = await this.client.confirmConnected(
      this.options.socketPath(),
      bootstrap.runtimeId,
    );
    this.update(connected);
    await this.options.openHostedTestWorkspace(
      this.options.hostedWorkspacePath ?? hostedTestWorkspacePath,
    );
  }

  private async finishRemoval(status: DeveloperHostedRuntimeStatus): Promise<void> {
    const runtimeId = status.runtimeRegistryId;
    if (runtimeId) {
      const runtime = this.options
        .runtimeRegistry()
        .list()
        .find((candidate) => candidate.runtimeId === runtimeId);
      if (runtime?.managedHosted) {
        await this.options.runtimeRegistry().removeManagedHostedRuntime(runtimeId);
      }
    }
    await this.client.finalizeRemoval(this.options.socketPath());
  }

  private update(status: DeveloperHostedRuntimeStatus): void {
    this.current = status;
    this.emit(status);
    this.scheduleExpiryRefresh(status);
  }

  private scheduleExpiryRefresh(status: DeveloperHostedRuntimeStatus): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (
      status.operationKind !== "ensure" ||
      status.phase !== "connected" ||
      status.deletionScheduledAt === ""
    ) {
      return;
    }
    const delay = Date.parse(status.deletionScheduledAt) - Date.now();
    this.expiryTimer = setTimeout(
      () => {
        this.expiryTimer = null;
        void this.refreshAfterExpiry();
      },
      Math.max(0, delay),
    );
  }

  private async refreshAfterExpiry(): Promise<void> {
    try {
      const status = await this.client.readStatus(this.options.socketPath());
      if (!status) {
        return;
      }
      this.update(status);
      await this.handleActionableStatus(status);
      this.follow(this.current ?? status);
    } catch {
      if (this.current) {
        this.update({
          ...this.current,
          phase: "needs_attention",
          reasonCode: "connection_failed",
          retryable: true,
          terminalOutcome: null,
        });
      }
    }
  }

  private emit(status: DeveloperHostedRuntimeStatus): void {
    for (const sender of this.options.senders()) {
      if (!sender.isDestroyed()) {
        sender.send(ipcEvents.developerHostedRuntimeStatus, status);
      }
    }
  }

  private requireEnabled(): void {
    if (!this.options.enabled) {
      throw new Error("developer hosted runtime is not enabled");
    }
  }

  private get client(): DeveloperHostedRuntimeClient {
    return this.options.client ?? defaultClient;
  }
}
