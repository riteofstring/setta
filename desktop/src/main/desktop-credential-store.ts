import type { CredentialSecretStore } from "./credential-secret-store";

export interface DesktopDeviceIdentity {
  deviceId: string;
  secret: string;
  userId: string;
}

export interface RuntimeAccessCredential {
  deviceId: string;
  expiresAt: string;
  runtimeId: string;
  token: string;
}

interface StoredDeviceIdentitySecret {
  deviceId: string;
  schemaVersion: 1;
  secret: string;
  userId: string;
}

interface StoredRuntimeCredentialSecret {
  deviceId: string;
  expiresAt: string;
  runtimeId: string;
  schemaVersion: 1;
  token: string;
}

const deviceIdentityRefPrefix = "setta-device-identity:v1:";
const runtimeCredentialRefPrefix = "setta-runtime-access-credential:v1:";

export class DesktopCredentialStore {
  constructor(private readonly secrets: CredentialSecretStore) {}

  async deleteDeviceIdentity(ref: string): Promise<void> {
    await this.secrets.deleteSecret(ref);
  }

  async deleteRuntimeCredential(ref: string): Promise<void> {
    await this.secrets.deleteSecret(ref);
  }

  async getDeviceIdentity(ref: string): Promise<DesktopDeviceIdentity | null> {
    const raw = await this.secrets.getSecret(ref);
    if (raw === null) {
      return null;
    }
    return decodeStoredDeviceIdentity(JSON.parse(raw), ref);
  }

  async getRuntimeCredential(ref: string): Promise<RuntimeAccessCredential | null> {
    const raw = await this.secrets.getSecret(ref);
    if (raw === null) {
      return null;
    }
    return decodeStoredRuntimeCredential(JSON.parse(raw), ref);
  }

  async setDeviceIdentity(identity: DesktopDeviceIdentity): Promise<string> {
    validateDeviceIdentity(identity);
    const ref = deviceIdentitySecretRef(identity);
    const stored: StoredDeviceIdentitySecret = {
      deviceId: identity.deviceId,
      schemaVersion: 1,
      secret: identity.secret,
      userId: identity.userId,
    };
    await this.secrets.setSecret(ref, JSON.stringify(stored));
    return ref;
  }

  async setRuntimeCredential(credential: RuntimeAccessCredential): Promise<string> {
    validateRuntimeCredential(credential);
    const ref = runtimeCredentialSecretRef(credential);
    const stored: StoredRuntimeCredentialSecret = {
      deviceId: credential.deviceId,
      expiresAt: credential.expiresAt,
      runtimeId: credential.runtimeId,
      schemaVersion: 1,
      token: credential.token,
    };
    await this.secrets.setSecret(ref, JSON.stringify(stored));
    return ref;
  }
}

export function deviceIdentitySecretRef(
  identity: Pick<DesktopDeviceIdentity, "deviceId" | "userId">,
): string {
  requireNonEmptyString(identity.userId, "device identity userId");
  requireNonEmptyString(identity.deviceId, "device identity deviceId");
  return `${deviceIdentityRefPrefix}${refSegment(identity.userId)}:${refSegment(identity.deviceId)}`;
}

export function runtimeCredentialSecretRef(
  credential: Pick<RuntimeAccessCredential, "deviceId" | "runtimeId">,
): string {
  requireNonEmptyString(credential.runtimeId, "runtime credential runtimeId");
  requireNonEmptyString(credential.deviceId, "runtime credential deviceId");
  return `${runtimeCredentialRefPrefix}${refSegment(credential.runtimeId)}:${refSegment(credential.deviceId)}`;
}

function decodeStoredDeviceIdentity(value: unknown, ref: string): DesktopDeviceIdentity {
  const record = assertRecord(value, "StoredDeviceIdentitySecret");
  if (record.schemaVersion !== 1) {
    throw new Error(`StoredDeviceIdentitySecret.schemaVersion is unsupported for ${ref}`);
  }
  const identity = {
    deviceId: stringField(record, "deviceId", "StoredDeviceIdentitySecret"),
    secret: stringField(record, "secret", "StoredDeviceIdentitySecret"),
    userId: stringField(record, "userId", "StoredDeviceIdentitySecret"),
  };
  const expectedRef = deviceIdentitySecretRef(identity);
  if (ref !== expectedRef) {
    throw new Error("StoredDeviceIdentitySecret ref does not match identity");
  }
  return identity;
}

function decodeStoredRuntimeCredential(value: unknown, ref: string): RuntimeAccessCredential {
  const record = assertRecord(value, "StoredRuntimeCredentialSecret");
  if (record.schemaVersion !== 1) {
    throw new Error(`StoredRuntimeCredentialSecret.schemaVersion is unsupported for ${ref}`);
  }
  const credential = {
    deviceId: stringField(record, "deviceId", "StoredRuntimeCredentialSecret"),
    expiresAt: stringField(record, "expiresAt", "StoredRuntimeCredentialSecret"),
    runtimeId: stringField(record, "runtimeId", "StoredRuntimeCredentialSecret"),
    token: stringField(record, "token", "StoredRuntimeCredentialSecret"),
  };
  const expectedRef = runtimeCredentialSecretRef(credential);
  if (ref !== expectedRef) {
    throw new Error("StoredRuntimeCredentialSecret ref does not match credential");
  }
  validateRuntimeCredential(credential);
  return credential;
}

function validateDeviceIdentity(identity: DesktopDeviceIdentity): void {
  requireNonEmptyString(identity.userId, "device identity userId");
  requireNonEmptyString(identity.deviceId, "device identity deviceId");
  requireNonEmptyString(identity.secret, "device identity secret");
}

function validateRuntimeCredential(credential: RuntimeAccessCredential): void {
  requireNonEmptyString(credential.runtimeId, "runtime credential runtimeId");
  requireNonEmptyString(credential.deviceId, "runtime credential deviceId");
  requireNonEmptyString(credential.token, "runtime credential token");
  requireValidTimestamp(credential.expiresAt, "runtime credential expiresAt");
}

function requireNonEmptyString(value: string, label: string): void {
  if (value.trim() === "") {
    throw new Error(`${label} is required`);
  }
}

function requireValidTimestamp(value: string, label: string): void {
  requireNonEmptyString(value, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function refSegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
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
