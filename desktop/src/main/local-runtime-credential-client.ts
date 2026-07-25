import { createBackendClient, type EnrollResponse } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { isBackendRequestError } from "@shared/backend-runtime";
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
  let enrolled;
  try {
    enrolled = await createBackendClient(
      options.pairing.baseUrl,
      options.fetchImpl,
    ).localCredentialEnroll({
      clientDisplayName: options.clientDisplayName,
      pairingToken: options.pairing.pairingToken,
    });
  } catch (error) {
    if (isBackendRequestError(error) && error.code === "invalid_pairing_token") {
      throw new RuntimePairingError(
        "invalid_pairing_token",
        "pairing token is invalid, expired, or already used",
      );
    }
    throw new RuntimePairingError("unreachable", `runtime is unreachable: ${errorMessage(error)}`);
  }
  const enrollment = enrollmentFromResponse(enrolled);
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
    return createBackendClient(request.baseUrl, this.fetchImpl).localCredentialRefresh({
      deviceId: request.deviceIdentity.deviceId,
      deviceSecret: request.deviceIdentity.secret,
      runtimeId: request.runtimeId,
    });
  }
}

function enrollmentFromResponse(response: EnrollResponse): LocalRuntimeEnrollment {
  const runtimeId = response.runtimeId;
  const deviceId = response.deviceId;
  const deviceIdentity = {
    deviceId,
    secret: response.deviceSecret,
    userId: response.userId,
  };
  const protocolVersion = response.protocolVersion;
  const runtimeCredential = response.runtimeCredential;
  if (runtimeCredential.deviceId !== deviceId || runtimeCredential.runtimeId !== runtimeId) {
    throw new Error("local enrollment credential does not match the enrolled identity");
  }
  return { deviceIdentity, protocolVersion, runtimeCredential, runtimeId };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
