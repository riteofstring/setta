import type { BackendFetch } from "@shared/backend-runtime";
import type { DesktopDeviceIdentity, RuntimeAccessCredential } from "./desktop-credential-store";
import type {
  ControlPlaneRuntimeCredentialClient,
  RefreshRuntimeCredentialRequest,
} from "./runtime-credential-manager";
import type { ParsedPairingURL } from "./runtime-pairing";
import { RuntimePairingError } from "./runtime-pairing";

export interface LocalRuntimeEnrollment {
  deviceIdentity: DesktopDeviceIdentity;
  protocolVersion: number;
  runtimeCredential: RuntimeAccessCredential;
  runtimeId: string;
}

export async function enrollWithLocalRuntimeIssuer(options: {
  clientDisplayName: string;
  fetchImpl: BackendFetch;
  pairing: ParsedPairingURL;
}): Promise<LocalRuntimeEnrollment> {
  let response: Response;
  try {
    response = await options.fetchImpl(
      new URL("local-credentials/enroll", options.pairing.baseUrl),
      {
        body: JSON.stringify({
          clientDisplayName: options.clientDisplayName,
          pairingToken: options.pairing.pairingToken,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
  } catch (error) {
    throw new RuntimePairingError("unreachable", `runtime is unreachable: ${errorMessage(error)}`);
  }
  const payload = await responseJSON(response);
  if (!response.ok) {
    const code = errorCode(payload);
    if (response.status === 401 && code === "invalid_pairing_token") {
      throw new RuntimePairingError(
        "invalid_pairing_token",
        "pairing token is invalid, expired, or already used",
      );
    }
    throw new RuntimePairingError(
      "unreachable",
      `local credential enrollment returned HTTP ${response.status}`,
    );
  }
  const enrollment = decodeEnrollment(payload);
  if (enrollment.runtimeId !== options.pairing.runtimeId) {
    throw new RuntimePairingError(
      "runtime_id_mismatch",
      `pairing response runtime_id ${enrollment.runtimeId} does not match URL runtime_id ${options.pairing.runtimeId}`,
    );
  }
  return enrollment;
}

export class LocalRuntimeCredentialClient implements ControlPlaneRuntimeCredentialClient {
  constructor(private readonly fetchImpl: BackendFetch) {}

  async refreshRuntimeCredential(
    request: RefreshRuntimeCredentialRequest,
  ): Promise<RuntimeAccessCredential> {
    const response = await this.fetchImpl(new URL("local-credentials/refresh", request.baseUrl), {
      body: JSON.stringify({
        deviceId: request.deviceIdentity.deviceId,
        deviceSecret: request.deviceIdentity.secret,
        runtimeId: request.runtimeId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = await responseJSON(response);
    if (!response.ok) {
      throw new Error(`local runtime credential refresh returned HTTP ${response.status}`);
    }
    return decodeRuntimeCredential(payload, "LocalCredentialRefreshResponse");
  }
}

function decodeEnrollment(value: unknown): LocalRuntimeEnrollment {
  const record = objectValue(value, "LocalCredentialEnrollResponse");
  const runtimeId = stringValue(record.runtimeId, "LocalCredentialEnrollResponse.runtimeId");
  const deviceId = stringValue(record.deviceId, "LocalCredentialEnrollResponse.deviceId");
  const deviceIdentity = {
    deviceId,
    secret: stringValue(record.deviceSecret, "LocalCredentialEnrollResponse.deviceSecret"),
    userId: stringValue(record.userId, "LocalCredentialEnrollResponse.userId"),
  };
  const protocolVersion = record.protocolVersion;
  if (typeof protocolVersion !== "number" || !Number.isInteger(protocolVersion)) {
    throw new Error("LocalCredentialEnrollResponse.protocolVersion must be an integer");
  }
  const runtimeCredential = decodeRuntimeCredential(
    record.runtimeCredential,
    "LocalCredentialEnrollResponse.runtimeCredential",
  );
  if (runtimeCredential.deviceId !== deviceId || runtimeCredential.runtimeId !== runtimeId) {
    throw new Error("local enrollment credential does not match the enrolled identity");
  }
  return { deviceIdentity, protocolVersion, runtimeCredential, runtimeId };
}

function decodeRuntimeCredential(value: unknown, label: string): RuntimeAccessCredential {
  const record = objectValue(value, label);
  const credential = {
    deviceId: stringValue(record.deviceId, `${label}.deviceId`),
    expiresAt: stringValue(record.expiresAt, `${label}.expiresAt`),
    runtimeId: stringValue(record.runtimeId, `${label}.runtimeId`),
    token: stringValue(record.token, `${label}.token`),
  };
  if (Number.isNaN(Date.parse(credential.expiresAt))) {
    throw new Error(`${label}.expiresAt must be an ISO timestamp`);
  }
  return credential;
}

async function responseJSON(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body === "") {
    throw new Error(`credential endpoint returned an empty HTTP ${response.status} response`);
  }
  return JSON.parse(body) as unknown;
}

function errorCode(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const error = (value as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return null;
  }
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
