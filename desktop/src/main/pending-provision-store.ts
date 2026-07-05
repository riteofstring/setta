import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { RuntimeSecretStore } from "./runtime-secret-store";

type ProvisionRuntimeScheme = "http" | "https";

export interface PendingProvisionRecord {
  attestationKey: string;
  createdAt: string;
  expectedTag: string;
  expiresAt: string;
  pairingToken: string;
  provisionId: string;
  runtimeName: string;
  runtimePort: number;
  scheme: ProvisionRuntimeScheme;
}

export interface PendingProvisionInput {
  attestationKey: string;
  createdAt?: string;
  expectedTag?: string;
  expiresAt: string;
  pairingToken: string;
  provisionId: string;
  runtimeName: string;
  runtimePort?: number;
  scheme?: ProvisionRuntimeScheme;
}

interface StoredPendingProvision {
  attestation_key_ref: string;
  created_at: string;
  expected_tag: string;
  expires_at: string;
  pairing_token_ref: string;
  provision_id: string;
  runtime_name: string;
  runtime_port: number;
  scheme: ProvisionRuntimeScheme;
}

interface StoredPendingProvisionRegistry {
  schema_version: 1;
  provisions: StoredPendingProvision[];
}

const pendingProvisionFileName = "pending-provisions.json";
const pendingProvisionSchemaVersion = 1;
const pendingProvisionSecretRefPrefix = "pending-provision:v1:";
const defaultExpectedRuntimeTag = "tag:setta-runtime";
const defaultRuntimePort = 7345;

export class PendingProvisionStore {
  constructor(
    private readonly userDataDir: string,
    private readonly secretStore: RuntimeSecretStore,
  ) {}

  path(): string {
    return pendingProvisionStoragePath(this.userDataDir);
  }

  async upsert(input: PendingProvisionInput): Promise<PendingProvisionRecord> {
    const record = normalizePendingProvisionInput(input);
    const previousRefs = await this.readStoredSecretRefs();
    const registry = await this.readStoredRegistry();
    const provisions = registry.provisions.filter(
      (provision) => provision.provision_id !== record.provisionId,
    );
    provisions.push(encodePendingProvision(record));
    provisions.sort((left, right) => left.provision_id.localeCompare(right.provision_id));
    await this.secretStore.setSecret(
      pairingTokenSecretRef(record.provisionId),
      record.pairingToken,
    );
    await this.secretStore.setSecret(
      attestationKeySecretRef(record.provisionId),
      record.attestationKey,
    );
    await this.writeStoredRegistry({ ...registry, provisions });
    await this.deleteUnusedSecrets(previousRefs, new Set(storedSecretRefs(provisions)));
    return record;
  }

  async read(provisionId: string): Promise<PendingProvisionRecord | null> {
    requireString(provisionId, "provisionId");
    const registry = await this.readStoredRegistry();
    const stored = registry.provisions.find((provision) => provision.provision_id === provisionId);
    if (!stored) {
      return null;
    }
    return this.decodePendingProvision(
      stored,
      `PendingProvisionRegistry.provisions.${provisionId}`,
    );
  }

  async readAll(): Promise<PendingProvisionRecord[]> {
    const registry = await this.readStoredRegistry();
    const records: PendingProvisionRecord[] = [];
    for (const [index, provision] of registry.provisions.entries()) {
      records.push(
        await this.decodePendingProvision(
          provision,
          `PendingProvisionRegistry.provisions[${index}]`,
        ),
      );
    }
    return records;
  }

  async delete(provisionId: string): Promise<void> {
    requireString(provisionId, "provisionId");
    const previousRefs = await this.readStoredSecretRefs();
    const registry = await this.readStoredRegistry();
    const provisions = registry.provisions.filter(
      (provision) => provision.provision_id !== provisionId,
    );
    await this.writeStoredRegistry({ ...registry, provisions });
    await this.deleteUnusedSecrets(previousRefs, new Set(storedSecretRefs(provisions)));
  }

  private async decodePendingProvision(
    stored: StoredPendingProvision,
    label: string,
  ): Promise<PendingProvisionRecord> {
    const expectedPairingRef = pairingTokenSecretRef(stored.provision_id);
    if (stored.pairing_token_ref !== expectedPairingRef) {
      throw new Error(`${label}.pairing_token_ref does not match provision_id`);
    }
    const expectedAttestationRef = attestationKeySecretRef(stored.provision_id);
    if (stored.attestation_key_ref !== expectedAttestationRef) {
      throw new Error(`${label}.attestation_key_ref does not match provision_id`);
    }
    const pairingToken = await this.secretStore.getSecret(stored.pairing_token_ref);
    if (pairingToken === null) {
      throw new Error(`${label}.pairing_token_ref references a missing pairing token`);
    }
    const attestationKey = await this.secretStore.getSecret(stored.attestation_key_ref);
    if (attestationKey === null) {
      throw new Error(`${label}.attestation_key_ref references a missing attestation key`);
    }
    return normalizePendingProvisionInput({
      attestationKey,
      createdAt: stored.created_at,
      expectedTag: stored.expected_tag,
      expiresAt: stored.expires_at,
      pairingToken,
      provisionId: stored.provision_id,
      runtimeName: stored.runtime_name,
      runtimePort: stored.runtime_port,
      scheme: stored.scheme,
    });
  }

  private async deleteUnusedSecrets(previousRefs: Set<string>, currentRefs: Set<string>) {
    for (const ref of previousRefs) {
      if (!currentRefs.has(ref)) {
        await this.secretStore.deleteSecret(ref);
      }
    }
  }

  private async readStoredSecretRefs(): Promise<Set<string>> {
    const registry = await this.readStoredRegistry();
    return new Set(storedSecretRefs(registry.provisions));
  }

  private async readStoredRegistry(): Promise<StoredPendingProvisionRegistry> {
    let raw: string;
    try {
      raw = await readFile(this.path(), "utf8");
    } catch (error) {
      if (isENOENT(error)) {
        return emptyStoredPendingProvisionRegistry();
      }
      throw error;
    }
    return decodeStoredPendingProvisionRegistry(JSON.parse(raw));
  }

  private async writeStoredRegistry(registry: StoredPendingProvisionRegistry): Promise<void> {
    const path = this.path();
    await mkdir(dirname(path), { recursive: true });
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(registry, null, 2) + "\n", { mode: 0o600 });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, path);
  }
}

export function pendingProvisionStoragePath(userDataDir: string): string {
  return join(userDataDir, pendingProvisionFileName);
}

function normalizePendingProvisionInput(input: PendingProvisionInput): PendingProvisionRecord {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const runtimePort = input.runtimePort ?? defaultRuntimePort;
  const scheme = input.scheme ?? "http";
  const expectedTag = input.expectedTag ?? defaultExpectedRuntimeTag;
  validatePendingProvisionRequiredFields({ ...input, createdAt, expectedTag });
  validatePendingProvisionShape({
    createdAt,
    expectedTag,
    expiresAt: input.expiresAt,
    runtimePort,
    scheme,
  });
  return {
    attestationKey: input.attestationKey,
    createdAt,
    expectedTag,
    expiresAt: input.expiresAt,
    pairingToken: input.pairingToken,
    provisionId: input.provisionId,
    runtimeName: input.runtimeName,
    runtimePort,
    scheme,
  };
}

function validatePendingProvisionRequiredFields(
  input: PendingProvisionInput & { createdAt: string; expectedTag: string },
): void {
  requireString(input.provisionId, "provisionId");
  requireString(input.runtimeName, "runtimeName");
  requireString(input.pairingToken, "pairingToken");
  requireString(input.attestationKey, "attestationKey");
  requireString(input.expiresAt, "expiresAt");
  requireString(input.createdAt, "createdAt");
  requireString(input.expectedTag, "expectedTag");
}

function validatePendingProvisionShape(input: {
  createdAt?: string;
  expectedTag: string;
  expiresAt: string;
  runtimePort: number;
  scheme: string;
}): void {
  if (input.createdAt) {
    requireTimestamp(input.createdAt, "createdAt");
  }
  requireTimestamp(input.expiresAt, "expiresAt");
  if (!input.expectedTag.startsWith("tag:")) {
    throw new Error("expectedTag must be a Tailscale tag");
  }
  if (input.scheme !== "http" && input.scheme !== "https") {
    throw new Error("scheme must be http or https");
  }
  if (!Number.isInteger(input.runtimePort) || input.runtimePort < 1 || input.runtimePort > 65535) {
    throw new Error("runtimePort must be an integer TCP port");
  }
}

function encodePendingProvision(record: PendingProvisionRecord): StoredPendingProvision {
  return {
    attestation_key_ref: attestationKeySecretRef(record.provisionId),
    created_at: record.createdAt,
    expected_tag: record.expectedTag,
    expires_at: record.expiresAt,
    pairing_token_ref: pairingTokenSecretRef(record.provisionId),
    provision_id: record.provisionId,
    runtime_name: record.runtimeName,
    runtime_port: record.runtimePort,
    scheme: record.scheme,
  };
}

function decodeStoredPendingProvisionRegistry(value: unknown): StoredPendingProvisionRegistry {
  const record = assertRecord(value, "PendingProvisionRegistry");
  if (record.schema_version !== pendingProvisionSchemaVersion) {
    throw new Error(
      `PendingProvisionRegistry.schema_version is unsupported: ${String(record.schema_version)}`,
    );
  }
  const rawProvisions = record.provisions;
  if (!Array.isArray(rawProvisions)) {
    throw new Error("PendingProvisionRegistry.provisions must be an array");
  }
  return {
    provisions: rawProvisions.map((provision, index) =>
      decodeStoredPendingProvision(provision, `PendingProvisionRegistry.provisions[${index}]`),
    ),
    schema_version: pendingProvisionSchemaVersion,
  };
}

function decodeStoredPendingProvision(value: unknown, label: string): StoredPendingProvision {
  const record = assertRecord(value, label);
  const scheme = stringField(record, "scheme", label);
  if (scheme !== "http" && scheme !== "https") {
    throw new Error(`${label}.scheme must be http or https`);
  }
  return {
    attestation_key_ref: stringField(record, "attestation_key_ref", label),
    created_at: stringField(record, "created_at", label),
    expected_tag: stringField(record, "expected_tag", label),
    expires_at: stringField(record, "expires_at", label),
    pairing_token_ref: stringField(record, "pairing_token_ref", label),
    provision_id: stringField(record, "provision_id", label),
    runtime_name: stringField(record, "runtime_name", label),
    runtime_port: integerField(record, "runtime_port", label),
    scheme,
  };
}

function emptyStoredPendingProvisionRegistry(): StoredPendingProvisionRegistry {
  return { provisions: [], schema_version: pendingProvisionSchemaVersion };
}

function storedSecretRefs(provisions: StoredPendingProvision[]): string[] {
  return provisions.flatMap((provision) => [
    provision.attestation_key_ref,
    provision.pairing_token_ref,
  ]);
}

function pairingTokenSecretRef(provisionId: string): string {
  return `${pendingProvisionSecretRefPrefix}${provisionId}:pairing-token`;
}

function attestationKeySecretRef(provisionId: string): string {
  return `${pendingProvisionSecretRefPrefix}${provisionId}:attestation-key`;
}

function requireString(value: string, label: string): void {
  if (value.trim() !== value || value === "") {
    throw new Error(`${label} is required`);
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      throw new Error(`${label} must not contain control characters`);
    }
  }
}

function requireTimestamp(value: string, label: string): void {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label}.${field} must be a non-empty string`);
  }
  return value;
}

function integerField(record: Record<string, unknown>, field: string, label: string): number {
  const value = record[field];
  if (!Number.isInteger(value)) {
    throw new Error(`${label}.${field} must be an integer`);
  }
  return value as number;
}

function isENOENT(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
