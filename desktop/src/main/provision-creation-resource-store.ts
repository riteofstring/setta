import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { RuntimeInfrastructureProvider } from "@generated/backend";
import type { CloudRuntimeProvisionResourceView } from "@shared/types";
import type { KnownRuntimeRecord } from "./known-runtime-store";

const provisionCreationRecordFileName = "provision-creations.json";
const provisionCreationRecordSchemaVersion = 1;

interface ProvisionCreationResourceStoreInput {
  now: Date;
  runtimes: KnownRuntimeRecord[];
}

interface StoredProvisionCreationRegistry {
  creations: StoredProvisionCreationRecord[];
  schemaVersion: number;
}

interface StoredProvisionCreationRecord {
  createdAt: string;
  expectedResourceName: string;
  lastError?: string;
  provider: string;
  recordId: string;
  region: string;
  resourceId?: string;
  runtimeName: string;
  status: string;
  teardownAction: StoredProvisionCreationTeardownAction;
  updatedAt: string;
}

interface StoredProvisionCreationTeardownAction {
  missingFields?: string[];
  ready: boolean;
}

const provisionInfrastructureProviders: Record<string, RuntimeInfrastructureProvider> = {
  aws: {
    displayName: "AWS",
    iconUrl: "https://aws.amazon.com/favicon.ico",
    id: "aws",
  },
  hetzner: {
    displayName: "Hetzner",
    iconUrl: "https://www.hetzner.com/favicon.ico",
    id: "hetzner",
  },
};

const unknownInfrastructureProvider = {
  displayName: "Unknown provider",
  iconUrl: "",
  id: "unknown",
} satisfies RuntimeInfrastructureProvider;

export class ProvisionCreationResourceStore {
  constructor(private readonly appDataDir: string) {}

  path(): string {
    return join(this.appDataDir, provisionCreationRecordFileName);
  }

  async readResources(
    input: ProvisionCreationResourceStoreInput,
  ): Promise<CloudRuntimeProvisionResourceView[]> {
    const registry = await this.readRegistry();
    return registry.creations
      .filter((record) => record.status !== "deleted")
      .map((record) => this.resourceView(record, input))
      .sort(compareCloudProvisionResources);
  }

  private async readRegistry(): Promise<StoredProvisionCreationRegistry> {
    let raw: string;
    try {
      raw = await readFile(this.path(), "utf8");
    } catch (error) {
      if (isENOENT(error)) {
        return { creations: [], schemaVersion: provisionCreationRecordSchemaVersion };
      }
      throw error;
    }
    const registry = decodeProvisionCreationRegistry(JSON.parse(raw));
    if (registry.schemaVersion !== provisionCreationRecordSchemaVersion) {
      throw new Error(
        `ProvisionCreationRegistry.schemaVersion is unsupported: ${registry.schemaVersion}`,
      );
    }
    return registry;
  }

  private resourceView(
    record: StoredProvisionCreationRecord,
    input: ProvisionCreationResourceStoreInput,
  ): CloudRuntimeProvisionResourceView {
    const lastReachableAt = lastReachableAtFor(record, input.runtimes);
    const commands = provisionResourceCommands(this.appDataDir, record);
    return {
      account: null,
      billingWarning: billingWarning(record, input.now, lastReachableAt),
      cleanupSummary: cleanupSummary(record),
      commands,
      createdAt: record.createdAt,
      expectedResourceName: record.expectedResourceName,
      infrastructureProvider:
        provisionInfrastructureProviders[record.provider] ?? unknownInfrastructureProvider,
      lastError: record.lastError ?? null,
      lastReachableAt,
      recordId: record.recordId,
      region: record.region,
      resourceId: record.resourceId ?? null,
      runtimeName: record.runtimeName,
      status: record.status,
      statusMessage: statusMessage(record),
      teardownReady: record.teardownAction.ready,
      updatedAt: record.updatedAt,
    };
  }
}

function decodeProvisionCreationRegistry(value: unknown): StoredProvisionCreationRegistry {
  const record = recordValue(value, "ProvisionCreationRegistry");
  const creations = arrayField(record, "creations", "ProvisionCreationRegistry").map(
    (item, index) =>
      decodeProvisionCreationRecord(item, `ProvisionCreationRegistry.creations[${index}]`),
  );
  return {
    creations,
    schemaVersion: numberField(record, "schemaVersion", "ProvisionCreationRegistry"),
  };
}

function decodeProvisionCreationRecord(
  value: unknown,
  label: string,
): StoredProvisionCreationRecord {
  const record = recordValue(value, label);
  return {
    createdAt: stringField(record, "createdAt", label),
    expectedResourceName: stringField(record, "expectedResourceName", label),
    lastError: optionalStringField(record, "lastError", label),
    provider: stringField(record, "provider", label),
    recordId: stringField(record, "recordId", label),
    region: stringField(record, "region", label),
    resourceId: optionalStringField(record, "resourceId", label),
    runtimeName: stringField(record, "runtimeName", label),
    status: stringField(record, "status", label),
    teardownAction: decodeProvisionCreationTeardownAction(
      recordValue(record.teardownAction, `${label}.teardownAction`),
      `${label}.teardownAction`,
    ),
    updatedAt: stringField(record, "updatedAt", label),
  };
}

function decodeProvisionCreationTeardownAction(
  record: Record<string, unknown>,
  label: string,
): StoredProvisionCreationTeardownAction {
  return {
    missingFields: optionalStringArrayField(record, "missingFields", label),
    ready: booleanField(record, "ready", label),
  };
}

function lastReachableAtFor(
  record: StoredProvisionCreationRecord,
  runtimes: KnownRuntimeRecord[],
): string | null {
  const runtime = runtimes.find((candidate) => {
    if (candidate.isLocal) {
      return false;
    }
    return (
      candidate.displayName === record.runtimeName ||
      runtimeURLHostTitle(candidate.baseUrl) === record.runtimeName
    );
  });
  return runtime?.lastConnected ?? null;
}

function billingWarning(
  record: StoredProvisionCreationRecord,
  now: Date,
  lastReachableAt: string | null,
): string | null {
  const createdDate = formatDate(record.createdAt);
  if (lastReachableAt !== null) {
    const unreachableDays = elapsedWholeDays(lastReachableAt, now);
    if (unreachableDays === 0) {
      return null;
    }
    return `Created via Setta on ${createdDate}; last reached ${unreachableDays} day${unreachableDays === 1 ? "" : "s"} ago and it may still be billing.`;
  }
  const createdAgeDays = elapsedWholeDays(record.createdAt, now);
  const createdAge =
    createdAgeDays === 0 ? "today" : `for ${createdAgeDays} day${createdAgeDays === 1 ? "" : "s"}`;
  switch (record.status) {
    case "pending":
      return `Created via Setta on ${createdDate}; pairing has not completed and the machine may still be billing.`;
    case "succeeded":
      return `Created via Setta on ${createdDate}; this desktop has not reached the runtime ${createdAge} and it may still be billing.`;
    case "failed":
      return `Create failed after Setta wrote a provider record on ${createdDate}; the resource may still exist and bill.`;
    default:
      return `Created via Setta on ${createdDate}; status is ${record.status} and the resource may still be billing.`;
  }
}

function statusMessage(record: StoredProvisionCreationRecord): string {
  switch (record.status) {
    case "pending":
      return "Provisioning record is pending; the runtime has not paired yet.";
    case "succeeded":
      return "Provider create command succeeded; pairing may still need attention.";
    case "failed":
      return record.lastError
        ? `Provider create command failed: ${record.lastError}`
        : "Provider create command failed after mutation was attempted.";
    default:
      return `Provisioning record status is ${record.status}.`;
  }
}

function cleanupSummary(record: StoredProvisionCreationRecord): string {
  if (record.teardownAction.ready) {
    return "Stored teardown is ready; review the plan before deleting this resource.";
  }
  const missing = record.teardownAction.missingFields ?? [];
  if (missing.length === 0) {
    return "Stored teardown is not ready for this resource.";
  }
  return `Stored teardown is not ready; missing ${missing.join(", ")}.`;
}

function provisionResourceCommands(
  appDataDir: string,
  record: StoredProvisionCreationRecord,
): CloudRuntimeProvisionResourceView["commands"] {
  const inspectArgs = [
    "setta",
    "provision",
    "inspect",
    "--json",
    "--app-data-dir",
    appDataDir,
    "--provider",
    record.provider,
    "--runtime-name",
    record.runtimeName,
  ];
  if (record.provider === "aws") {
    inspectArgs.push("--stack-name", record.expectedResourceName);
  }
  const recordSelector = ["--app-data-dir", appDataDir, "--record-id", record.recordId];
  const teardownPlan = record.teardownAction.ready
    ? shellCommand(["setta", "provision", "down", "--json", "--plan-only", ...recordSelector])
    : null;
  const teardownApprove = record.teardownAction.ready
    ? shellCommand(["setta", "provision", "down", "--json", "--approve", ...recordSelector])
    : null;
  return {
    diagnose: shellCommand(["setta", "provision", "diagnose", "--json", ...recordSelector]),
    inspect: shellCommand(inspectArgs),
    teardownApprove,
    teardownPlan,
  };
}

function shellCommand(args: string[]): string {
  return args.map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runtimeURLHostTitle(baseUrl: string): string | null {
  const hostName = new URL(baseUrl).hostname.trim().replace(/\.$/, "");
  if (hostName === "") {
    return null;
  }
  const [firstLabel] = hostName.split(".");
  return firstLabel && firstLabel !== "" ? firstLabel : null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().slice(0, 10);
}

function elapsedWholeDays(value: string, now: Date): number {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function compareCloudProvisionResources(
  left: CloudRuntimeProvisionResourceView,
  right: CloudRuntimeProvisionResourceView,
): number {
  const created = right.createdAt.localeCompare(left.createdAt);
  return created !== 0 ? created : left.recordId.localeCompare(right.recordId);
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${label}.${key} must be a string`);
  }
  return value;
}

function optionalStringField(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${label}.${key} must be a string`);
  }
  return value;
}

function numberField(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new Error(`${label}.${key} must be a number`);
  }
  return value;
}

function booleanField(record: Record<string, unknown>, key: string, label: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${label}.${key} must be a boolean`);
  }
  return value;
}

function arrayField(record: Record<string, unknown>, key: string, label: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be an array`);
  }
  return value;
}

function optionalStringArrayField(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label}.${key} must be a string array`);
  }
  return value;
}

function isENOENT(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
