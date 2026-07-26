import type {
  BackendClient,
  SpeechProvider,
  SpeechCredentialStatus,
  SpeechCredentialValidationResult,
} from "@generated/backend";
import { isBackendRequestError } from "@shared/backend-runtime";
import type {
  SpeechCredentialOperation,
  SpeechCredentialProviderRequest,
  SpeechCredentialSaveRequest,
  SpeechCredentialSettings,
} from "@shared/speech-ipc";
import { openAISpeechProviderID } from "@shared/speech-providers";
import {
  SpeechCredentialVaultError,
  type SpeechCredentialVaultReadResult,
  type SpeechCredentialVaultRecoverySnapshot,
} from "./speech-credential-vault";

export interface SpeechCredentialVaultStore {
  createRecoverySnapshot(): Promise<SpeechCredentialVaultRecoverySnapshot>;
  read(): Promise<SpeechCredentialVaultReadResult>;
  remove(): Promise<void>;
  restoreRecoverySnapshot(snapshot: SpeechCredentialVaultRecoverySnapshot): Promise<void>;
  write(apiKey: string): Promise<void>;
}

export type SpeechCredentialRuntimeClient = Pick<
  BackendClient,
  "clearDesktopSpeechCredential" | "loadDesktopSpeechCredential" | "validateDesktopSpeechCredential"
>;

export interface LocalSpeechCredentialRuntime {
  client: SpeechCredentialRuntimeClient;
  runtimeId: string;
}

export interface SpeechCredentialCoordinatorOptions {
  onSettingsChanged?: (settings: SpeechCredentialSettings) => void;
  secureStorageUnavailableMessage?: string;
  vault: SpeechCredentialVaultStore | null;
}

const openAIProvider = openAISpeechProviderID();

export class SpeechCredentialCoordinator {
  private localRuntime: LocalSpeechCredentialRuntime | null = null;
  private localRuntimeGeneration = 0;
  private operationRunning = false;
  private operationSettled: Promise<void> = Promise.resolve();
  private resolveOperationSettled: (() => void) | null = null;
  private lastPublishedSettings: SpeechCredentialSettings | null = null;

  constructor(private readonly options: SpeechCredentialCoordinatorOptions) {}

  setLocalRuntime(
    runtime: LocalSpeechCredentialRuntime | null,
  ): Promise<SpeechCredentialSettings | null> {
    this.localRuntime = runtime;
    this.localRuntimeGeneration += 1;
    if (runtime === null) {
      if (this.lastPublishedSettings?.status === "loading") {
        this.publish(failedSettings("restore", "Local speech runtime is not connected."));
      }
      return Promise.resolve(null);
    }
    return this.restoreCredentialForRuntime(runtime, this.localRuntimeGeneration);
  }

  async readCredentialSettings(
    request: SpeechCredentialProviderRequest,
  ): Promise<SpeechCredentialSettings> {
    const providerFailure = requireOpenAIProvider(request.provider, "read");
    if (providerFailure !== null) {
      return providerFailure;
    }
    const vault = this.options.vault;
    if (vault === null) {
      return secureStorageUnavailableSettings(this.options.secureStorageUnavailableMessage);
    }
    const read = await vault.read();
    return settingsFromVaultRead(read);
  }

  async saveCredential(request: SpeechCredentialSaveRequest): Promise<SpeechCredentialSettings> {
    return this.runCredentialOperation("save", () => this.saveCredentialUnlocked(request));
  }

  async removeCredential(
    request: SpeechCredentialProviderRequest,
  ): Promise<SpeechCredentialSettings> {
    return this.runCredentialOperation("remove", () => this.removeCredentialUnlocked(request));
  }

  private async saveCredentialUnlocked(
    request: SpeechCredentialSaveRequest,
  ): Promise<SpeechCredentialSettings> {
    const providerFailure = requireOpenAIProvider(request.provider, "save");
    if (providerFailure !== null) {
      return this.publish(providerFailure);
    }
    const validationMessage = validateSubmittedAPIKey(request.apiKey);
    if (validationMessage !== null) {
      return this.publish(failedSettings("save", validationMessage));
    }

    const vault = this.options.vault;
    if (vault === null) {
      return this.publish(
        secureStorageUnavailableSettings(this.options.secureStorageUnavailableMessage),
      );
    }

    const runtime = this.localRuntime;
    if (runtime === null) {
      return this.publish(failedSettings("save", "Local speech runtime is not connected."));
    }

    const validated = await validateCandidate(runtime.client, request.provider, request.apiKey);
    if (validated.status === "failed") {
      return this.publish(failedSettings("save", validated.message));
    }

    const previousSnapshot = await vault.createRecoverySnapshot();
    if (previousSnapshot.status === "corrupt") {
      return this.publish(settingsFromCorruptSnapshot(previousSnapshot));
    }

    const persisted = await persistCandidate(vault, request.apiKey);
    if (persisted.status === "failed") {
      return this.publish(failedSettings("save", persisted.message));
    }

    const loaded = await loadCandidate(runtime.client, request.provider, request.apiKey);
    if (loaded.status === "configured") {
      return this.publish(configuredSettings());
    }

    return this.publish(
      await this.rollbackAfterLoadFailure(vault, runtime.client, previousSnapshot, loaded.message),
    );
  }

  private async removeCredentialUnlocked(
    request: SpeechCredentialProviderRequest,
  ): Promise<SpeechCredentialSettings> {
    const providerFailure = requireOpenAIProvider(request.provider, "remove");
    if (providerFailure !== null) {
      return this.publish(providerFailure);
    }
    const vault = this.options.vault;
    if (vault === null) {
      return this.publish(
        secureStorageUnavailableSettings(this.options.secureStorageUnavailableMessage),
      );
    }

    const runtime = this.localRuntime;
    const removed = await removePersistedCredential(vault);
    if (removed.status === "failed") {
      return this.publish(failedSettings("remove", removed.message));
    }

    if (runtime === null) {
      return this.publish(
        failedSettings(
          "remove",
          "The saved speech credential was removed, but the local speech runtime is not connected.",
        ),
      );
    }

    const cleared = await clearRuntimeCredential(runtime.client, request.provider);
    if (cleared.status === "failed") {
      return this.publish(
        failedSettings(
          "remove",
          "The saved speech credential was removed, but the current local runtime may retain it until it exits.",
        ),
      );
    }
    return this.publish(notConfiguredSettings());
  }

  private async restoreCredentialForRuntime(
    runtime: LocalSpeechCredentialRuntime,
    generation: number,
  ): Promise<SpeechCredentialSettings | null> {
    while (!this.tryBeginCredentialOperation()) {
      await this.operationSettled;
      if (!this.isCurrentLocalRuntime(runtime, generation)) {
        return null;
      }
    }
    try {
      return await this.restoreCredentialForRuntimeUnlocked(runtime, generation);
    } finally {
      this.finishCredentialOperation();
    }
  }

  private async restoreCredentialForRuntimeUnlocked(
    runtime: LocalSpeechCredentialRuntime,
    generation: number,
  ): Promise<SpeechCredentialSettings | null> {
    if (!this.isCurrentLocalRuntime(runtime, generation)) {
      return null;
    }
    this.publish({ status: "loading" });

    const vault = this.options.vault;
    if (vault === null) {
      if (!this.isCurrentLocalRuntime(runtime, generation)) {
        return null;
      }
      return this.publish(
        secureStorageUnavailableSettings(this.options.secureStorageUnavailableMessage),
      );
    }

    const read = await readPersistedCredential(vault);
    if (!this.isCurrentLocalRuntime(runtime, generation)) {
      return null;
    }
    if (read.status === "failed") {
      return this.publish(failedSettings("restore", read.message));
    }
    return this.restoreCredentialFromVaultRead(runtime, generation, read.result);
  }

  private async restoreCredentialFromVaultRead(
    runtime: LocalSpeechCredentialRuntime,
    generation: number,
    read: SpeechCredentialVaultReadResult,
  ): Promise<SpeechCredentialSettings | null> {
    switch (read.status) {
      case "corrupt":
      case "missing":
        return this.publish(settingsFromVaultRead(read));
      case "present":
        return this.loadRestoredCredential(runtime, generation, read.apiKey);
      default:
        return assertNever(read);
    }
  }

  private async loadRestoredCredential(
    runtime: LocalSpeechCredentialRuntime,
    generation: number,
    apiKey: string,
  ): Promise<SpeechCredentialSettings | null> {
    const loaded = await loadCandidate(runtime.client, openAIProvider, apiKey);
    if (!this.isCurrentLocalRuntime(runtime, generation)) {
      return null;
    }
    if (loaded.status === "configured") {
      return this.publish(configuredSettings());
    }
    return this.publish(failedSettings("restore", loaded.message));
  }

  private async rollbackAfterLoadFailure(
    vault: SpeechCredentialVaultStore,
    runtime: SpeechCredentialRuntimeClient,
    previousSnapshot: Exclude<SpeechCredentialVaultRecoverySnapshot, { status: "corrupt" }>,
    loadFailureMessage: string,
  ): Promise<SpeechCredentialSettings> {
    const restoredVault = await restoreVaultSnapshot(vault, previousSnapshot);
    if (restoredVault.status === "failed") {
      return failedSettings(
        "save",
        "Speech credential save failed and rollback could not restore the prior stored credential.",
      );
    }

    const restoredRuntime = await restoreRuntimeFromSnapshot(vault, runtime, previousSnapshot);
    if (restoredRuntime.status === "failed") {
      return failedSettings(
        "save",
        "Speech credential save failed and rollback could not restore the prior local runtime credential.",
      );
    }

    return failedSettings("save", `${loadFailureMessage} The previous credential was restored.`);
  }

  private async runCredentialOperation(
    operation: SpeechCredentialOperation,
    run: () => Promise<SpeechCredentialSettings>,
  ): Promise<SpeechCredentialSettings> {
    if (!this.tryBeginCredentialOperation()) {
      return this.publish(
        failedSettings(operation, "A speech credential operation is already in progress."),
      );
    }
    try {
      return await run();
    } finally {
      this.finishCredentialOperation();
    }
  }

  private publish(settings: SpeechCredentialSettings): SpeechCredentialSettings {
    this.lastPublishedSettings = settings;
    this.options.onSettingsChanged?.(settings);
    return settings;
  }

  private tryBeginCredentialOperation(): boolean {
    if (this.operationRunning) {
      return false;
    }
    this.operationRunning = true;
    this.operationSettled = new Promise((resolve) => {
      this.resolveOperationSettled = resolve;
    });
    return true;
  }

  private finishCredentialOperation(): void {
    this.operationRunning = false;
    const resolve = this.resolveOperationSettled;
    this.resolveOperationSettled = null;
    resolve?.();
  }

  private isCurrentLocalRuntime(
    runtime: LocalSpeechCredentialRuntime,
    generation: number,
  ): boolean {
    return this.localRuntime === runtime && this.localRuntimeGeneration === generation;
  }
}

async function validateCandidate(
  client: SpeechCredentialRuntimeClient,
  provider: SpeechProvider,
  apiKey: string,
): Promise<
  | { status: "valid"; result: SpeechCredentialValidationResult }
  | { status: "failed"; message: string }
> {
  try {
    const result = await client.validateDesktopSpeechCredential({ provider, apiKey });
    if (!result.valid) {
      return { message: "OpenAI rejected the speech credential.", status: "failed" };
    }
    return { result, status: "valid" };
  } catch (error) {
    return {
      message: safeFailureMessage(error, "OpenAI credential validation failed."),
      status: "failed",
    };
  }
}

async function persistCandidate(
  vault: SpeechCredentialVaultStore,
  apiKey: string,
): Promise<{ status: "persisted" } | { status: "failed"; message: string }> {
  try {
    await vault.write(apiKey);
    return { status: "persisted" };
  } catch (error) {
    return {
      message: safeFailureMessage(error, "Failed to save the speech credential."),
      status: "failed",
    };
  }
}

async function loadCandidate(
  client: SpeechCredentialRuntimeClient,
  provider: SpeechProvider,
  apiKey: string,
): Promise<
  { status: "configured"; result: SpeechCredentialStatus } | { status: "failed"; message: string }
> {
  try {
    const result = await client.loadDesktopSpeechCredential({ provider, apiKey });
    if (result.providerStatus !== "configured") {
      return {
        message: "The local speech runtime did not configure the saved credential.",
        status: "failed",
      };
    }
    return { result, status: "configured" };
  } catch (error) {
    return {
      message: safeFailureMessage(error, "Failed to load the speech credential."),
      status: "failed",
    };
  }
}

async function readPersistedCredential(
  vault: SpeechCredentialVaultStore,
): Promise<
  | { status: "read"; result: SpeechCredentialVaultReadResult }
  | { status: "failed"; message: string }
> {
  try {
    return { result: await vault.read(), status: "read" };
  } catch (error) {
    return {
      message: safeFailureMessage(error, "Failed to read the saved speech credential."),
      status: "failed",
    };
  }
}

async function removePersistedCredential(
  vault: SpeechCredentialVaultStore,
): Promise<{ status: "removed" } | { status: "failed"; message: string }> {
  try {
    await vault.remove();
    return { status: "removed" };
  } catch (error) {
    return {
      message: safeFailureMessage(error, "Failed to remove the speech credential."),
      status: "failed",
    };
  }
}

async function clearRuntimeCredential(
  client: SpeechCredentialRuntimeClient,
  provider: SpeechProvider,
): Promise<
  { status: "cleared"; result: SpeechCredentialStatus } | { status: "failed"; message: string }
> {
  try {
    const result = await client.clearDesktopSpeechCredential({ provider });
    return { result, status: "cleared" };
  } catch {
    return { message: "Failed to clear the local speech runtime credential.", status: "failed" };
  }
}

async function restoreVaultSnapshot(
  vault: SpeechCredentialVaultStore,
  snapshot: Exclude<SpeechCredentialVaultRecoverySnapshot, { status: "corrupt" }>,
): Promise<{ status: "restored" } | { status: "failed" }> {
  try {
    await vault.restoreRecoverySnapshot(snapshot);
    return { status: "restored" };
  } catch {
    return { status: "failed" };
  }
}

async function restoreRuntimeFromSnapshot(
  vault: SpeechCredentialVaultStore,
  runtime: SpeechCredentialRuntimeClient,
  snapshot: Exclude<SpeechCredentialVaultRecoverySnapshot, { status: "corrupt" }>,
): Promise<{ status: "restored" } | { status: "failed" }> {
  if (snapshot.status === "missing") {
    const cleared = await clearRuntimeCredential(runtime, openAIProvider);
    return cleared.status === "cleared" ? { status: "restored" } : { status: "failed" };
  }

  const read = await vault.read();
  if (read.status !== "present") {
    return { status: "failed" };
  }
  const loaded = await loadCandidate(runtime, openAIProvider, read.apiKey);
  return loaded.status === "configured" ? { status: "restored" } : { status: "failed" };
}

function settingsFromVaultRead(read: SpeechCredentialVaultReadResult): SpeechCredentialSettings {
  switch (read.status) {
    case "corrupt":
      return settingsFromCorruptSnapshot(read);
    case "missing":
      return notConfiguredSettings();
    case "present":
      return configuredSettings();
    default:
      return assertNever(read);
  }
}

function settingsFromCorruptSnapshot(
  snapshot: Extract<
    SpeechCredentialVaultReadResult | SpeechCredentialVaultRecoverySnapshot,
    { status: "corrupt" }
  >,
): SpeechCredentialSettings {
  return {
    message: snapshot.message,
    reason: snapshot.reason,
    status: "corrupt",
  };
}

function configuredSettings(): SpeechCredentialSettings {
  return { provider: openAIProvider, status: "configured" };
}

function notConfiguredSettings(): SpeechCredentialSettings {
  return { provider: openAIProvider, status: "not_configured" };
}

function secureStorageUnavailableSettings(message?: string): SpeechCredentialSettings {
  return {
    message: message ?? "Secure storage is unavailable for speech credentials.",
    status: "secure_storage_unavailable",
  };
}

function failedSettings(
  operation: SpeechCredentialOperation,
  message: string,
): SpeechCredentialSettings {
  return { message, operation, status: "failed" };
}

function requireOpenAIProvider(
  provider: SpeechProvider,
  operation: SpeechCredentialOperation,
): SpeechCredentialSettings | null {
  if (provider === openAIProvider) {
    return null;
  }
  return failedSettings(operation, `Speech credentials do not support provider ${provider}.`);
}

function validateSubmittedAPIKey(apiKey: string): string | null {
  if (apiKey.trim() === "") {
    return "OpenAI API key is required.";
  }
  if (apiKey !== apiKey.trim()) {
    return "OpenAI API key must not contain leading or trailing whitespace.";
  }
  for (const char of apiKey) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint < 0x21 || codePoint > 0x7e) {
      return "OpenAI API key must contain only visible ASCII characters.";
    }
  }
  return null;
}

function safeFailureMessage(error: unknown, fallback: string): string {
  if (isBackendRequestError(error)) {
    return error.message;
  }
  if (error instanceof SpeechCredentialVaultError) {
    return error.message;
  }
  return fallback;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected speech credential coordinator state: ${String(value)}`);
}
