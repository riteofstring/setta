interface BackendRequestEndpoint {
  method: string;
  path: string;
}

interface BackendErrorPayload {
  error: {
    code: string;
    message: string;
    operationApplied: boolean;
  };
}

type BackendPayloadDecoder<T> = (value: unknown) => T;

export type BackendFetch = (input: URL, init: RequestInit) => Promise<Response>;

export interface BackendEventBase<TType extends string> {
  schemaVersion: number;
  streamId: string;
  sequence: number;
  eventId: string;
  type: TType;
  emittedAt: string;
  workspaceId: string;
  conversationId: string;
  runId: string;
}

interface BackendRequest<ResponsePayload, ErrorPayload extends BackendErrorPayload> {
  baseURL: string;
  decodeErrorResponse: BackendPayloadDecoder<ErrorPayload>;
  decodeResponse: BackendPayloadDecoder<ResponsePayload>;
  endpoint: BackendRequestEndpoint;
  fetchImpl: BackendFetch;
  requestPayload: unknown | undefined;
}

const backendRequestErrorBrand = Symbol("BackendRequestError");

export interface BackendRequestError extends Error {
  readonly [backendRequestErrorBrand]: true;
  readonly code: string;
  readonly operationApplied: boolean;
}

export function createBackendRequestError(
  code: string,
  message: string,
  operationApplied: boolean,
): BackendRequestError {
  return Object.assign(new Error(message), {
    [backendRequestErrorBrand]: true as const,
    code,
    operationApplied,
  });
}

export function isBackendRequestError(error: unknown): error is BackendRequestError {
  return (
    error instanceof Error &&
    (error as Partial<BackendRequestError>)[backendRequestErrorBrand] === true
  );
}

export function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  return value as Record<string, unknown>;
}

export function assertKnownFields(
  record: Record<string, unknown>,
  label: string,
  fields: readonly string[],
) {
  for (const field of Object.keys(record)) {
    if (!fields.includes(field)) {
      throw new Error(label + " contains unknown field " + field);
    }
  }
}

export function requireField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): unknown {
  if (!(field in record)) {
    throw new Error(label + "." + field + " is required");
  }
  return record[field];
}

export function assertTaggedUnionBranch(
  label: string,
  kind: string,
  branchesByKind: Record<string, unknown>,
): void {
  const populated = Object.keys(branchesByKind).filter(
    (branchKind) => branchesByKind[branchKind] != null,
  );
  if (populated.length !== 1) {
    throw new Error(label + " must populate exactly one branch payload, found " + populated.length);
  }
  if (populated[0] !== kind) {
    throw new Error(
      label + " kind " + kind + " does not match populated " + populated[0] + " branch",
    );
  }
}

export function decodeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(label + " must be a boolean");
  }
  return value;
}

export function decodeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(label + " must be an integer");
  }
  return value;
}

export function decodeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(label + " must be a finite number");
  }
  return value;
}

export function decodeString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(label + " must be a string");
  }
  return value;
}

export function decodeArray<T>(
  value: unknown,
  label: string,
  decodeItem: BackendPayloadDecoder<T>,
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(label + " must be an array");
  }
  return value.map(decodeItem);
}

export function decodeNullable<T>(
  value: unknown,
  _label: string,
  decodeValue: BackendPayloadDecoder<T>,
): T | null {
  if (value === null) {
    return null;
  }
  return decodeValue(value);
}

export function decodeStringRecord(value: unknown, label: string): Record<string, string> {
  const record = assertRecord(value, label);
  const decoded: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    decoded[key] = decodeString(item, `${label}.${key}`);
  }
  return decoded;
}

export function decodeIntegerRecord(value: unknown, label: string): Record<string, number> {
  const record = assertRecord(value, label);
  const decoded: Record<string, number> = {};
  for (const [key, item] of Object.entries(record)) {
    decoded[key] = decodeInteger(item, `${label}.${key}`);
  }
  return decoded;
}

export function decodeUnknown(value: unknown, _label: string): unknown {
  void _label;
  return value;
}

export function decodeBackendEventBase<TType extends string>(
  record: Record<string, unknown>,
  label: string,
  expectedType: TType,
): BackendEventBase<TType> {
  assertKnownFields(record, label, [
    "schemaVersion",
    "streamId",
    "sequence",
    "eventId",
    "type",
    "emittedAt",
    "workspaceId",
    "conversationId",
    "runId",
    "payload",
  ]);
  const type = decodeString(requireField(record, "type", label), label + ".type");
  if (type !== expectedType) {
    throw new Error(label + ".type must be " + expectedType + ", got " + type);
  }
  return {
    schemaVersion: decodeInteger(
      requireField(record, "schemaVersion", label),
      label + ".schemaVersion",
    ),
    streamId: decodeString(requireField(record, "streamId", label), label + ".streamId"),
    sequence: decodeInteger(requireField(record, "sequence", label), label + ".sequence"),
    eventId: decodeString(requireField(record, "eventId", label), label + ".eventId"),
    type: expectedType,
    emittedAt: decodeString(requireField(record, "emittedAt", label), label + ".emittedAt"),
    workspaceId: decodeString(requireField(record, "workspaceId", label), label + ".workspaceId"),
    conversationId: decodeString(
      requireField(record, "conversationId", label),
      label + ".conversationId",
    ),
    runId: decodeString(requireField(record, "runId", label), label + ".runId"),
  };
}

export async function requestBackend<ResponsePayload, ErrorPayload extends BackendErrorPayload>(
  request: BackendRequest<ResponsePayload, ErrorPayload>,
): Promise<ResponsePayload> {
  const { baseURL, decodeErrorResponse, decodeResponse, endpoint, fetchImpl, requestPayload } =
    request;
  const init: RequestInit = { method: endpoint.method };
  const url = new URL(endpoint.path, baseURL);
  if (requestPayload !== undefined && endpoint.method === "GET") {
    appendQueryPayload(url, requestPayload);
  } else if (requestPayload !== undefined) {
    init.body = JSON.stringify(requestPayload);
    init.headers = { "Content-Type": "application/json" };
  }

  const response = await fetchImpl(url, init);
  const payload: unknown = await response.json();
  if (!response.ok) {
    const decoded = decodeErrorResponse(payload).error;
    throw createBackendRequestError(decoded.code, decoded.message, decoded.operationApplied);
  }
  return decodeResponse(payload);
}

function appendQueryPayload(url: URL, payload: unknown) {
  const record = assertRecord(payload, "GET request payload");
  for (const [key, value] of Object.entries(record)) {
    switch (typeof value) {
      case "boolean":
      case "number":
      case "string":
        url.searchParams.set(key, String(value));
        break;
      default:
        if (value === null) {
          throw new Error(`GET request payload ${key} must not be null`);
        }
        throw new Error(`GET request payload ${key} must be a primitive`);
    }
  }
}
