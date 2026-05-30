interface BackendRequestEndpoint {
  method: string;
  path: string;
}

interface BackendErrorPayload {
  error: {
    message: string;
  };
}

type BackendPayloadDecoder<T> = (value: unknown) => T;

export type BackendFetch = (input: URL, init: RequestInit) => Promise<Response>;

interface BackendRequest<ResponsePayload, ErrorPayload extends BackendErrorPayload> {
  baseURL: string;
  decodeErrorResponse: BackendPayloadDecoder<ErrorPayload>;
  decodeResponse: BackendPayloadDecoder<ResponsePayload>;
  endpoint: BackendRequestEndpoint;
  fetchImpl: BackendFetch;
  requestPayload: unknown | undefined;
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

export function decodeStringRecord(value: unknown, label: string): Record<string, string> {
  const record = assertRecord(value, label);
  const decoded: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    decoded[key] = decodeString(item, `${label}.${key}`);
  }
  return decoded;
}

export async function requestBackend<ResponsePayload, ErrorPayload extends BackendErrorPayload>(
  request: BackendRequest<ResponsePayload, ErrorPayload>,
): Promise<ResponsePayload> {
  const { baseURL, decodeErrorResponse, decodeResponse, endpoint, fetchImpl, requestPayload } =
    request;
  const init: RequestInit = { method: endpoint.method };
  if (requestPayload !== undefined) {
    init.body = JSON.stringify(requestPayload);
    init.headers = { "Content-Type": "application/json" };
  }

  const response = await fetchImpl(new URL(endpoint.path, baseURL), init);
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(decodeErrorResponse(payload).error.message);
  }
  return decodeResponse(payload);
}
