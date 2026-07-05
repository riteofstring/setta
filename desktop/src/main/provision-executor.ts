import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CloudRuntimeProvisionAuthInput,
  CloudRuntimeProvisionCreationRecord,
  CloudRuntimeProvisionExecutedResult,
  CloudRuntimeProvisionExecuteRequest,
  CloudRuntimeProvisionExecuteResult,
  CloudRuntimeProvisionExecutionFileInput,
  CloudRuntimeProvisionExecutionPlan,
  CloudRuntimeProvisionExistingRecordAction,
  CloudRuntimeProvisionExistingRecordResult,
  CloudRuntimeProvisionReleaseInput,
  CloudRuntimeProvisionResolution,
} from "@shared/types";
import type { PendingProvisionStore } from "./pending-provision-store";
import type { TailnetClient } from "./provision-watch";
import { TailscaleStatusClient } from "./provision-watch";
import type { RuntimeRegistryController } from "./runtime-registry";
import {
  defaultExecFileRunner,
  type ExecFileRunner,
  runSettaCLI,
  settaCLIInvocation,
} from "./setta-cli";
import type { TailscaleOAuthService } from "./tailscale-oauth";

const provisionExecutionMaxBufferBytes = 10 * 1024 * 1024;
const provisionRuntimePort = 7345;
const provisionTTLSeconds = 60 * 60;
const expectedRuntimeTag = "tag:setta-runtime";
const provisionWatchPollIntervalEnv = "SETTA_CLOUD_PROVISION_WATCH_POLL_INTERVAL_MS";
const provisionWatchTimeoutEnv = "SETTA_CLOUD_PROVISION_WATCH_TIMEOUT_MS";

export interface CloudRuntimeProvisionExecutorOptions {
  appDataDir: string;
  env: NodeJS.ProcessEnv;
  execFileRunner?: ExecFileRunner;
  now?: () => Date;
  pendingProvisionStore: Pick<PendingProvisionStore, "delete" | "upsert">;
  repoRoot: string;
  runtimeRegistry: Pick<RuntimeRegistryController, "watchProvisionAndPair"> &
    Partial<Pick<RuntimeRegistryController, "refreshCloudProvisionResources">>;
  tailscaleOAuthService: Pick<TailscaleOAuthService, "mintAuthKey">;
  tailnetClient?: TailnetClient;
}

interface ProvisionSecrets {
  attestationKey: string;
  expiresAt: string;
  pairingToken: string;
  pairingTokenHash: string;
  provisionId: string;
}

interface RenderedCloudInit {
  cloudInit: string;
  cloudInitSha256: string;
}

interface RenderedAWSLink {
  prefilledParameters: Array<{ key: string; value: string }>;
  stackName: string;
  template: string;
  templateSha256: string;
}

interface ProvisionUpCLIExecutedResult {
  creationRecord: CloudRuntimeProvisionCreationRecord;
  mode: "executed";
  ok: boolean;
  plan: CloudRuntimeProvisionExecutionPlan;
  provider: string;
  warnings: string[];
}

interface ProvisionUpCLIExistingRecordResult {
  creationRecord: CloudRuntimeProvisionCreationRecord;
  mode: "existing_record";
  nextActions: CloudRuntimeProvisionExistingRecordAction[];
  ok: false;
  plan: CloudRuntimeProvisionExecutionPlan;
  provider: string;
  warnings: string[];
}

type ProvisionUpCLIResult = ProvisionUpCLIExecutedResult | ProvisionUpCLIExistingRecordResult;

interface ProvisionInspectCLIResult {
  creationRecord: CloudRuntimeProvisionCreationRecord | null;
  exists: boolean;
  nextActions: CloudRuntimeProvisionExistingRecordAction[];
  ok: boolean;
  provider: string;
  recordId: string;
}

interface ProvisionDiagnoseCLIResult {
  diagnostic: {
    summary: string[];
  } | null;
  execution: {
    error: string | null;
    providerOutput: string | null;
  } | null;
  ok: boolean;
}

export async function runApprovedCloudRuntimeProvision(
  request: CloudRuntimeProvisionExecuteRequest,
  options: CloudRuntimeProvisionExecutorOptions,
): Promise<CloudRuntimeProvisionExecuteResult> {
  const runtimeName = requiredTrimmed(request.runtimeName, "runtimeName");
  const release = normalizeReleaseInput(request.release);
  const resolution = request.resolution;
  const existing = await inspectExistingProvision(options, resolution, runtimeName);
  if (existing.exists) {
    await refreshCloudProvisionResources(options);
    return existingProvisionResult(existing, runtimeName);
  }
  const now = options.now ?? (() => new Date());
  const secrets = provisionSecrets(now);
  const tailscaleAuthKey = await tailscaleAuthKeyFor(request.auth, runtimeName, options);
  const tempDir = await mkdtemp(join(tmpdir(), "setta-cloud-runtime-"));
  try {
    const upArgs = await provisionUpArgsForResolution({
      options,
      release,
      resolution,
      runtimeName,
      secrets,
      tailscaleAuthKey,
      tempDir,
    });
    const pending = await options.pendingProvisionStore.upsert({
      attestationKey: secrets.attestationKey,
      createdAt: now().toISOString(),
      expectedTag: expectedRuntimeTag,
      expiresAt: secrets.expiresAt,
      pairingToken: secrets.pairingToken,
      provisionId: secrets.provisionId,
      runtimeName,
      runtimePort: provisionRuntimePort,
      scheme: "http",
    });
    let up: ProvisionUpCLIResult;
    try {
      up = await runProvisionUpCLI(options, upArgs);
    } catch (error) {
      await refreshCloudProvisionResources(options);
      throw error;
    }
    await refreshCloudProvisionResources(options);
    if (up.mode === "existing_record") {
      await options.pendingProvisionStore.delete(pending.provisionId);
      return existingProvisionResult(up, pending.runtimeName);
    }
    try {
      const snapshot = await options.runtimeRegistry.watchProvisionAndPair({
        pending,
        tailnetClient: options.tailnetClient ?? new TailscaleStatusClient(),
        ...provisionWatchTiming(options.env),
      });
      await options.pendingProvisionStore.delete(pending.provisionId);
      return {
        ...up,
        provisionId: pending.provisionId,
        runtimeName: pending.runtimeName,
        snapshot,
      } satisfies CloudRuntimeProvisionExecutedResult;
    } catch (error) {
      const diagnosis = await diagnoseProvisionWatchFailure(options, up.creationRecord.recordId);
      await refreshCloudProvisionResources(options);
      throw new Error(provisionWatchFailureMessage(error, diagnosis), { cause: error });
    }
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function refreshCloudProvisionResources(
  options: CloudRuntimeProvisionExecutorOptions,
): Promise<void> {
  await options.runtimeRegistry.refreshCloudProvisionResources?.();
}

function provisionWatchTiming(env: NodeJS.ProcessEnv): {
  pollIntervalMs?: number;
  timeoutMs?: number;
} {
  return {
    pollIntervalMs: optionalPositiveIntegerEnv(env, provisionWatchPollIntervalEnv),
    timeoutMs: optionalPositiveIntegerEnv(env, provisionWatchTimeoutEnv),
  };
}

function optionalPositiveIntegerEnv(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer number of milliseconds`);
  }
  return value;
}

async function provisionUpArgsForResolution(input: {
  options: CloudRuntimeProvisionExecutorOptions;
  release: CloudRuntimeProvisionReleaseInput;
  resolution: CloudRuntimeProvisionResolution;
  runtimeName: string;
  secrets: ProvisionSecrets;
  tailscaleAuthKey: string;
  tempDir: string;
}): Promise<string[]> {
  switch (input.resolution.provider) {
    case "aws":
      return awsProvisionUpArgs(input);
    case "hetzner":
      return hetznerProvisionUpArgs(input);
    default:
      throw new Error(
        `approved cloud execution is not available for provider ${input.resolution.provider}; use the console paste path`,
      );
  }
}

async function hetznerProvisionUpArgs(input: {
  options: CloudRuntimeProvisionExecutorOptions;
  release: CloudRuntimeProvisionReleaseInput;
  resolution: CloudRuntimeProvisionResolution;
  runtimeName: string;
  secrets: ProvisionSecrets;
  tailscaleAuthKey: string;
  tempDir: string;
}): Promise<string[]> {
  const rendered = await renderCloudInit(input);
  const cloudInitPath = join(input.tempDir, "cloud-init.yaml");
  await writeSecretFile(cloudInitPath, rendered.cloudInit);
  return [
    "--provider",
    "hetzner",
    "--runtime-name",
    input.runtimeName,
    "--shape",
    input.resolution.shape,
    "--region",
    input.resolution.region,
    "--disk-gb",
    String(input.resolution.diskGB),
    "--instance-type",
    input.resolution.instanceType,
    "--cloud-init-file",
    cloudInitPath,
  ];
}

async function awsProvisionUpArgs(input: {
  options: CloudRuntimeProvisionExecutorOptions;
  release: CloudRuntimeProvisionReleaseInput;
  resolution: CloudRuntimeProvisionResolution;
  runtimeName: string;
  secrets: ProvisionSecrets;
  tailscaleAuthKey: string;
  tempDir: string;
}): Promise<string[]> {
  const rendered = await renderAWSLink(input);
  const templatePath = join(input.tempDir, "aws-cloudformation.yaml");
  const parametersPath = join(input.tempDir, "aws-cloudformation-parameters.json");
  await writePublicFile(templatePath, rendered.template);
  await writeSecretFile(
    parametersPath,
    JSON.stringify(awsCloudFormationParameters(rendered, input), null, 2) + "\n",
  );
  return [
    "--provider",
    "aws",
    "--runtime-name",
    input.runtimeName,
    "--shape",
    input.resolution.shape,
    "--region",
    input.resolution.region,
    "--disk-gb",
    String(input.resolution.diskGB),
    "--instance-type",
    input.resolution.instanceType,
    "--stack-name",
    rendered.stackName,
    "--cloudformation-template-file",
    templatePath,
    "--cloudformation-parameters-file",
    parametersPath,
  ];
}

async function renderCloudInit(input: {
  options: CloudRuntimeProvisionExecutorOptions;
  release: CloudRuntimeProvisionReleaseInput;
  resolution: CloudRuntimeProvisionResolution;
  runtimeName: string;
  secrets: ProvisionSecrets;
  tailscaleAuthKey: string;
}): Promise<RenderedCloudInit> {
  const stdout = await runProvisionCLI(input.options, [
    "provision",
    "render-cloudinit",
    "--json",
    "--runtime-name",
    input.runtimeName,
    "--tailscale-auth-key",
    input.tailscaleAuthKey,
    "--pairing-token-hash",
    input.secrets.pairingTokenHash,
    "--provision-id",
    input.secrets.provisionId,
    "--provision-attestation-key",
    input.secrets.attestationKey,
    "--expires-at",
    input.secrets.expiresAt,
    "--setta-version",
    input.release.settaVersion,
    "--release-base-url",
    input.release.releaseBaseUrl,
    "--installer-sha256",
    input.release.installerSha256,
    "--minisign-public-key",
    input.release.minisignPublicKey,
    "--shape",
    input.resolution.shape,
    "--disk-gb",
    String(input.resolution.diskGB),
    "--runtime-port",
    String(provisionRuntimePort),
  ]);
  const record = parseJSONRecord(stdout, "setta provision render-cloudinit");
  if (record.ok !== true) {
    throw new Error("setta provision render-cloudinit returned ok=false");
  }
  return {
    cloudInit: requireString(record.cloudInit, "cloudInit"),
    cloudInitSha256: requireString(record.cloudInitSha256, "cloudInitSha256"),
  };
}

async function renderAWSLink(input: {
  options: CloudRuntimeProvisionExecutorOptions;
  release: CloudRuntimeProvisionReleaseInput;
  resolution: CloudRuntimeProvisionResolution;
  runtimeName: string;
  secrets: ProvisionSecrets;
}): Promise<RenderedAWSLink> {
  const stdout = await runProvisionCLI(input.options, [
    "provision",
    "render-link",
    "--json",
    "--provider",
    "aws",
    "--runtime-name",
    input.runtimeName,
    "--shape",
    input.resolution.shape,
    "--region",
    input.resolution.region,
    "--disk-gb",
    String(input.resolution.diskGB),
    "--instance-type",
    input.resolution.instanceType,
    "--provision-id",
    input.secrets.provisionId,
    "--expires-at",
    input.secrets.expiresAt,
    "--setta-version",
    input.release.settaVersion,
    "--release-base-url",
    input.release.releaseBaseUrl,
    "--installer-sha256",
    input.release.installerSha256,
    "--minisign-public-key",
    input.release.minisignPublicKey,
    "--runtime-port",
    String(provisionRuntimePort),
  ]);
  const record = parseJSONRecord(stdout, "setta provision render-link");
  if (record.ok !== true) {
    throw new Error("setta provision render-link returned ok=false");
  }
  return {
    prefilledParameters: requireArray(record.prefilledParameters, "prefilledParameters").map(
      (item, index) => {
        const parameter = requireRecord(item, `prefilledParameters[${index}]`);
        return {
          key: requireString(parameter.key, `prefilledParameters[${index}].key`),
          value: requireString(parameter.value, `prefilledParameters[${index}].value`),
        };
      },
    ),
    stackName: requireString(record.stackName, "stackName"),
    template: requireString(record.template, "template"),
    templateSha256: requireString(record.templateSha256, "templateSha256"),
  };
}

function awsCloudFormationParameters(
  rendered: RenderedAWSLink,
  input: {
    secrets: ProvisionSecrets;
    tailscaleAuthKey: string;
  },
): Array<{ ParameterKey: string; ParameterValue: string }> {
  const parameters = rendered.prefilledParameters.map((parameter) => ({
    ParameterKey: parameter.key,
    ParameterValue: parameter.value,
  }));
  parameters.push(
    { ParameterKey: "TailscaleAuthKey", ParameterValue: input.tailscaleAuthKey },
    { ParameterKey: "PairingTokenHash", ParameterValue: input.secrets.pairingTokenHash },
    { ParameterKey: "ProvisionAttestationKey", ParameterValue: input.secrets.attestationKey },
  );
  return parameters;
}

async function runProvisionUpCLI(
  options: CloudRuntimeProvisionExecutorOptions,
  args: string[],
): Promise<ProvisionUpCLIResult> {
  const stdout = await runProvisionCLI(options, [
    "provision",
    "up",
    "--json",
    "--approve",
    "--app-data-dir",
    options.appDataDir,
    ...args,
  ]);
  return parseProvisionUpResult(stdout);
}

async function inspectExistingProvision(
  options: CloudRuntimeProvisionExecutorOptions,
  resolution: CloudRuntimeProvisionResolution,
  runtimeName: string,
): Promise<ProvisionInspectCLIResult> {
  const stdout = await runProvisionCLI(options, [
    "provision",
    "inspect",
    "--json",
    "--app-data-dir",
    options.appDataDir,
    "--provider",
    resolution.provider,
    "--runtime-name",
    runtimeName,
  ]);
  return parseProvisionInspectResult(stdout);
}

async function diagnoseProvisionWatchFailure(
  options: CloudRuntimeProvisionExecutorOptions,
  recordId: string,
): Promise<ProvisionDiagnoseCLIResult | null> {
  try {
    const stdout = await runProvisionCLI(options, [
      "provision",
      "diagnose",
      "--json",
      "--app-data-dir",
      options.appDataDir,
      "--record-id",
      recordId,
    ]);
    return parseProvisionDiagnoseResult(stdout);
  } catch (error) {
    return {
      diagnostic: null,
      execution: {
        error: `provider diagnostic unavailable: ${errorMessage(error)}`,
        providerOutput: null,
      },
      ok: false,
    };
  }
}

async function runProvisionCLI(
  options: CloudRuntimeProvisionExecutorOptions,
  args: string[],
): Promise<string> {
  const invocation = settaCLIInvocation(options.repoRoot, options.env);
  const runner = options.execFileRunner ?? defaultExecFileRunner;
  const { stdout } = await runSettaCLI(
    runner,
    invocation,
    [...invocation.args, ...args],
    {
      ...options.env,
      SETTA_APP_DATA_DIR: options.appDataDir,
    },
    provisionExecutionMaxBufferBytes,
  );
  return stdout;
}

function parseProvisionUpResult(stdout: string): ProvisionUpCLIResult {
  const record = parseJSONRecord(stdout, "setta provision up");
  const mode = requireString(record.mode, "mode");
  if (mode === "executed") {
    if (record.ok !== true) {
      throw new Error("setta provision up returned ok=false for executed mode");
    }
    return {
      creationRecord: parseCreationRecord(requireRecord(record.creationRecord, "creationRecord")),
      mode,
      ok: true,
      plan: parseExecutionPlan(requireRecord(record.plan, "plan")),
      provider: requireString(record.provider, "provider"),
      warnings: requireStringArrayOrEmpty(record.warnings, "warnings"),
    };
  }
  if (mode === "existing_record") {
    if (record.ok !== false) {
      throw new Error("setta provision up existing_record result must return ok=false");
    }
    return {
      creationRecord: parseCreationRecord(requireRecord(record.creationRecord, "creationRecord")),
      mode,
      nextActions: parseExistingRecordActions(record.nextActions),
      ok: false,
      plan: parseExecutionPlan(requireRecord(record.plan, "plan")),
      provider: requireString(record.provider, "provider"),
      warnings: requireStringArrayOrEmpty(record.warnings, "warnings"),
    };
  }
  throw new Error(`setta provision up returned unsupported mode ${mode}`);
}

function parseProvisionInspectResult(stdout: string): ProvisionInspectCLIResult {
  const record = parseJSONRecord(stdout, "setta provision inspect");
  if (record.ok !== true) {
    throw new Error("setta provision inspect returned ok=false");
  }
  const exists = requireBoolean(record.exists, "exists");
  return {
    creationRecord:
      exists && record.creationRecord !== undefined && record.creationRecord !== null
        ? parseCreationRecord(requireRecord(record.creationRecord, "creationRecord"))
        : null,
    exists,
    nextActions: parseExistingRecordActions(record.nextActions),
    ok: true,
    provider: requireString(record.provider, "provider"),
    recordId: requireString(record.recordId, "recordId"),
  };
}

function parseProvisionDiagnoseResult(stdout: string): ProvisionDiagnoseCLIResult {
  const record = parseJSONRecord(stdout, "setta provision diagnose");
  return {
    diagnostic: parseProvisionDiagnostic(record.diagnostic),
    execution: parseProvisionDiagnosisExecution(record.execution),
    ok: requireBoolean(record.ok, "ok"),
  };
}

function parseProvisionDiagnostic(value: unknown): ProvisionDiagnoseCLIResult["diagnostic"] {
  if (value === undefined || value === null) {
    return null;
  }
  const record = requireRecord(value, "diagnostic");
  return {
    summary: requireStringArrayOrEmpty(record.summary, "diagnostic.summary"),
  };
}

function parseProvisionDiagnosisExecution(value: unknown): ProvisionDiagnoseCLIResult["execution"] {
  if (value === undefined || value === null) {
    return null;
  }
  const record = requireRecord(value, "execution");
  return {
    error: optionalString(record.error),
    providerOutput: optionalString(record.providerOutput),
  };
}

function provisionWatchFailureMessage(
  error: unknown,
  diagnosis: ProvisionDiagnoseCLIResult | null,
): string {
  const base = errorMessage(error);
  if (!diagnosis) {
    return base;
  }
  const details = provisionDiagnosisMessage(diagnosis);
  if (!details) {
    return base;
  }
  return `${base}\nProvider diagnosis: ${details}`;
}

function provisionDiagnosisMessage(diagnosis: ProvisionDiagnoseCLIResult): string | null {
  const summary = diagnosis.diagnostic?.summary ?? [];
  if (summary.length > 0) {
    return summary.join("; ");
  }
  const providerOutput = diagnosis.execution?.providerOutput;
  if (providerOutput) {
    return truncateDiagnosticText(providerOutput);
  }
  const error = diagnosis.execution?.error;
  if (error) {
    return error;
  }
  return diagnosis.ok ? null : "provider diagnostic probe did not return details";
}

function truncateDiagnosticText(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 2000) {
    return normalized;
  }
  return `${normalized.slice(0, 2000)}...`;
}

function existingProvisionResult(
  result: {
    creationRecord: CloudRuntimeProvisionCreationRecord | null;
    nextActions: CloudRuntimeProvisionExistingRecordAction[];
    provider: string;
    warnings?: string[];
  },
  runtimeName: string,
): CloudRuntimeProvisionExistingRecordResult {
  if (!result.creationRecord) {
    throw new Error("existing provision result did not include a creation record");
  }
  return {
    creationRecord: result.creationRecord,
    mode: "existing_record",
    nextActions: result.nextActions,
    ok: false,
    provider: result.provider,
    runtimeName,
    warnings: result.warnings ?? [],
  };
}

function parseCreationRecord(record: Record<string, unknown>): CloudRuntimeProvisionCreationRecord {
  const teardownAction =
    record.teardownAction === undefined || record.teardownAction === null
      ? null
      : requireRecord(record.teardownAction, "creationRecord.teardownAction");
  return {
    createdAt: optionalString(record.createdAt),
    expectedResourceName: optionalString(record.expectedResourceName),
    lastError: optionalString(record.lastError),
    provider: optionalString(record.provider),
    recordId: requireString(record.recordId, "creationRecord.recordId"),
    resourceId: optionalString(record.resourceId),
    runtimeName: requireString(record.runtimeName, "creationRecord.runtimeName"),
    status: requireString(record.status, "creationRecord.status"),
    teardownReady: teardownAction ? optionalBoolean(teardownAction.ready) : null,
    updatedAt: optionalString(record.updatedAt),
  };
}

function parseExistingRecordActions(value: unknown): CloudRuntimeProvisionExistingRecordAction[] {
  if (value === undefined || value === null) {
    return [];
  }
  return requireArray(value, "nextActions").map((item, index) => {
    const record = requireRecord(item, `nextActions[${index}]`);
    return {
      description: requireString(record.description, `nextActions[${index}].description`),
      id: requireString(record.id, `nextActions[${index}].id`),
      label: requireString(record.label, `nextActions[${index}].label`),
      mutating: requireBoolean(record.mutating, `nextActions[${index}].mutating`),
    };
  });
}

function parseExecutionPlan(record: Record<string, unknown>): CloudRuntimeProvisionExecutionPlan {
  return {
    actionId: requireString(record.actionId, "plan.actionId"),
    argv: requireStringArray(record.argv, "plan.argv"),
    cliBinary: requireString(record.cliBinary, "plan.cliBinary"),
    fileInputs: parseFileInputs(record.fileInputs),
    lastVerified: requireString(record.lastVerified, "plan.lastVerified"),
    mutating: requireBoolean(record.mutating, "plan.mutating"),
    provider: requireString(record.provider, "plan.provider"),
    requiresApproval: requireBoolean(record.requiresApproval, "plan.requiresApproval"),
    secretFree: requireBoolean(record.secretFree, "plan.secretFree"),
    teardownActionId: optionalString(record.teardownActionId),
    typedAction: requireString(record.typedAction, "plan.typedAction"),
  };
}

function parseFileInputs(value: unknown): CloudRuntimeProvisionExecutionFileInput[] {
  if (value === undefined || value === null) {
    return [];
  }
  return requireArray(value, "plan.fileInputs").map((item, index) => {
    const record = requireRecord(item, `plan.fileInputs[${index}]`);
    return {
      name: requireString(record.name, `plan.fileInputs[${index}].name`),
      path: requireString(record.path, `plan.fileInputs[${index}].path`),
      purpose: requireString(record.purpose, `plan.fileInputs[${index}].purpose`),
      sensitive: requireBoolean(record.sensitive, `plan.fileInputs[${index}].sensitive`),
      sha256: requireString(record.sha256, `plan.fileInputs[${index}].sha256`),
      sizeBytes: requireNumber(record.sizeBytes, `plan.fileInputs[${index}].sizeBytes`),
    };
  });
}

async function tailscaleAuthKeyFor(
  auth: CloudRuntimeProvisionAuthInput,
  runtimeName: string,
  options: CloudRuntimeProvisionExecutorOptions,
): Promise<string> {
  switch (auth.kind) {
    case "manual":
      return requiredTrimmed(auth.tailscaleAuthKey, "tailscaleAuthKey");
    case "oauth": {
      const result = await options.tailscaleOAuthService.mintAuthKey({
        description: `Setta runtime ${runtimeName}`,
        ephemeral: false,
        expirySeconds: provisionTTLSeconds,
        preauthorized: true,
        reusable: false,
        runtimeName,
        tags: [expectedRuntimeTag],
      });
      return result.authKey;
    }
    default:
      return assertNever(auth);
  }
}

function provisionSecrets(now: () => Date): ProvisionSecrets {
  const pairingToken = randomBytes(32).toString("base64url");
  return {
    attestationKey: randomBytes(32).toString("base64url"),
    expiresAt: new Date(now().getTime() + provisionTTLSeconds * 1000).toISOString(),
    pairingToken,
    pairingTokenHash: createHash("sha256").update(pairingToken).digest("hex"),
    provisionId: `provision_${randomBytes(16).toString("hex")}`,
  };
}

function normalizeReleaseInput(
  release: CloudRuntimeProvisionReleaseInput,
): CloudRuntimeProvisionReleaseInput {
  return {
    installerSha256: requiredTrimmed(release.installerSha256, "installerSha256"),
    minisignPublicKey: requiredTrimmed(release.minisignPublicKey, "minisignPublicKey"),
    releaseBaseUrl: requiredTrimmed(release.releaseBaseUrl, "releaseBaseUrl"),
    settaVersion: requiredTrimmed(release.settaVersion, "settaVersion"),
  };
}

async function writeSecretFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

async function writePublicFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: 0o644 });
}

function parseJSONRecord(stdout: string, command: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${command} did not return valid JSON: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  return requireRecord(parsed, command);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  return requireArray(value, label).map((item, index) => requireString(item, `${label}[${index}]`));
}

function requireStringArrayOrEmpty(value: unknown, label: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  return requireStringArray(value, label);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requiredTrimmed(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`${label} is required`);
  }
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      throw new Error(`${label} must not contain control characters`);
    }
  }
  return trimmed;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function assertNever(value: never): never {
  throw new Error(`unhandled cloud provision auth kind: ${JSON.stringify(value)}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
