import {
  backendEndpoints,
  decodeErrorResponse,
  decodeRuntimeInfoResponse,
  type RuntimeInfoResponse,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";

export type RuntimePairingFailureReason =
  | "invalid_pairing_url"
  | "invalid_pairing_token"
  | "runtime_id_mismatch"
  | "unreachable";

export type RuntimeConnectionFailureReason =
  | "incompatible"
  | "mismatched"
  | "revoked"
  | "unreachable";

export interface ParsedPairingURL {
  baseUrl: string;
  pairingToken: string;
  runtimeId: string;
}

export class RuntimePairingError extends Error {
  constructor(
    readonly reason: RuntimePairingFailureReason,
    message: string,
  ) {
    super(message);
  }
}

export class RuntimeConnectionError extends Error {
  constructor(
    readonly reason: RuntimeConnectionFailureReason,
    message: string,
    readonly details: Record<string, string | number | null> = {},
  ) {
    super(message);
  }
}

class RuntimeHTTPError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function parsePairingURL(rawURL: string): ParsedPairingURL {
  let parsed: URL;
  try {
    parsed = new URL(rawURL);
  } catch (error) {
    throw new RuntimePairingError("invalid_pairing_url", errorMessage(error));
  }
  if (parsed.protocol !== "setta:" || parsed.hostname !== "pair") {
    throw new RuntimePairingError(
      "invalid_pairing_url",
      "pairing URL must start with setta://pair",
    );
  }
  const runtimeId = requiredPairingParam(parsed, "rt");
  const pairingToken = requiredPairingParam(parsed, "tok");
  const baseUrl = validateRemoteRuntimeBaseURL(requiredPairingParam(parsed, "url"));
  return { baseUrl, pairingToken, runtimeId };
}

export function validateRemoteRuntimeBaseURL(rawURL: string): string {
  const parsed = parseRuntimeBaseURL(rawURL);
  requireHTTPRuntimeURL(parsed);
  requireRuntimeURLHost(parsed);
  requireRuntimeURLWithoutCredentials(parsed);
  requireRuntimeURLOriginOnly(parsed);
  parsed.pathname = "/";
  return parsed.toString();
}

export async function fetchRuntimeInfo(
  baseUrl: string,
  fetchImpl: BackendFetch,
): Promise<RuntimeInfoResponse> {
  try {
    return decodeRuntimeInfoResponse(
      await requestRuntimeJSON({
        baseUrl,
        endpoint: backendEndpoints.RuntimeInfo,
        fetchImpl,
      }),
    );
  } catch (error) {
    if (error instanceof RuntimeHTTPError) {
      throw new RuntimeConnectionError(
        "unreachable",
        `runtime info returned HTTP ${error.status}: ${error.message}`,
      );
    }
    throw unreachableConnectionError(baseUrl, error);
  }
}

export async function verifyRuntimeConnection(options: {
  authToken: string;
  baseUrl: string;
  expectedProtocolVersion: number;
  expectedRuntimeId: string;
  fetchImpl: BackendFetch;
}): Promise<RuntimeInfoResponse> {
  const info = await fetchRuntimeInfo(options.baseUrl, options.fetchImpl);
  if (info.runtimeId !== options.expectedRuntimeId) {
    throw new RuntimeConnectionError(
      "mismatched",
      `different runtime at this address: expected ${options.expectedRuntimeId}, got ${info.runtimeId}`,
      {
        actualRuntimeId: info.runtimeId,
        expectedRuntimeId: options.expectedRuntimeId,
      },
    );
  }
  if (info.protocolVersion !== options.expectedProtocolVersion) {
    throw new RuntimeConnectionError(
      "incompatible",
      `runtime protocol ${info.protocolVersion} does not match enrolled protocol ${options.expectedProtocolVersion}`,
      {
        protocolVersion: info.protocolVersion,
        supportedMax: options.expectedProtocolVersion,
        supportedMin: options.expectedProtocolVersion,
      },
    );
  }
  await verifyRuntimeCredential(options.baseUrl, options.authToken, options.fetchImpl);
  return info;
}

function parseRuntimeBaseURL(rawURL: string): URL {
  try {
    return new URL(rawURL);
  } catch (error) {
    throw new RuntimePairingError("invalid_pairing_url", errorMessage(error));
  }
}

function requireHTTPRuntimeURL(parsed: URL): void {
  if (parsed.protocol !== "http:") {
    throw new RuntimePairingError("invalid_pairing_url", "runtime URL must use http");
  }
}

function requireRuntimeURLHost(parsed: URL): void {
  if (parsed.host === "") {
    throw new RuntimePairingError("invalid_pairing_url", "runtime URL must include a host");
  }
}

function requireRuntimeURLWithoutCredentials(parsed: URL): void {
  if (parsed.username !== "" || parsed.password !== "") {
    throw new RuntimePairingError(
      "invalid_pairing_url",
      "runtime URL must not include credentials",
    );
  }
}

function requireRuntimeURLOriginOnly(parsed: URL): void {
  if (parsed.pathname !== "" && parsed.pathname !== "/") {
    throw new RuntimePairingError("invalid_pairing_url", "runtime URL must not include a path");
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new RuntimePairingError(
      "invalid_pairing_url",
      "runtime URL must not include query or fragment",
    );
  }
}

async function verifyRuntimeCredential(
  baseUrl: string,
  authToken: string,
  fetchImpl: BackendFetch,
): Promise<void> {
  try {
    await requestRuntimeJSON({
      authToken,
      baseUrl,
      endpoint: backendEndpoints.ListDevices,
      fetchImpl,
      requestPayload: {},
    });
  } catch (error) {
    if (error instanceof RuntimeHTTPError && error.status === 401) {
      throw new RuntimeConnectionError(
        "revoked",
        "runtime access was revoked; re-pair this device",
      );
    }
    if (error instanceof RuntimeHTTPError) {
      throw new RuntimeConnectionError(
        "unreachable",
        `runtime credential verification returned HTTP ${error.status}: ${error.message}`,
      );
    }
    throw unreachableConnectionError(baseUrl, error);
  }
}

async function requestRuntimeJSON(options: {
  authToken?: string;
  baseUrl: string;
  endpoint: { method: string; path: string };
  fetchImpl: BackendFetch;
  requestPayload?: unknown;
}): Promise<unknown> {
  const init: RequestInit = { method: options.endpoint.method };
  const headers = new Headers();
  if (options.authToken) {
    headers.set("Authorization", `Bearer ${options.authToken}`);
  }
  if (options.requestPayload !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.requestPayload);
  }
  if ([...headers.keys()].length > 0) {
    init.headers = headers;
  }
  const response = await options.fetchImpl(new URL(options.endpoint.path, options.baseUrl), init);
  const payload: unknown = await response.json();
  if (!response.ok) {
    const decoded = decodeErrorResponse(payload);
    throw new RuntimeHTTPError(response.status, decoded.error.code, decoded.error.message);
  }
  return payload;
}

function requiredPairingParam(parsed: URL, name: string): string {
  const value = parsed.searchParams.get(name);
  if (value === null || value === "") {
    throw new RuntimePairingError("invalid_pairing_url", `pairing URL is missing ${name}`);
  }
  return value;
}

function unreachableConnectionError(baseUrl: string, error: unknown): RuntimeConnectionError {
  return new RuntimeConnectionError(
    "unreachable",
    `runtime is unreachable at ${baseUrl}: ${errorMessage(error)}`,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
