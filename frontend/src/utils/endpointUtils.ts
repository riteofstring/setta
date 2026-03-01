import { useServerMode, useShareSession } from "state/definitions";
import { C_ADDRESSES } from "./c_addresses";
import {
  ENDPOINT_ORIGIN_POLICY,
  resolveEndpointOriginForMode,
  type EndpointOriginPolicy,
} from "./serverModeBoundaryPolicy";

export { ENDPOINT_ORIGIN_POLICY };

export type ResponseDataAndStatus<T> = {
  data: T | undefined;
  status: number | undefined;
  hasResponse: boolean;
};

const FRONTEND_DEBUG_POST_PATHS = [
  "/setCallable",
  "/setParamEnteredValue",
  "/undo",
  "/redo",
  "/setGenCodePrefix",
  "/setGenCodeSuffix",
  "/clearTextFieldCompletion",
];

function shouldLogDebugPost(address: string): boolean {
  return FRONTEND_DEBUG_POST_PATHS.some((path) => address.includes(path));
}

function logEndpointPostDebug(event: string, payload: unknown): void {
  console.log(`[endpoint-post-debug] ${event} ${JSON.stringify(payload)}`);
}

export function res200<T>(
  res: ResponseDataAndStatus<T>,
): res is ResponseDataAndStatus<T> & { data: T; status: number } {
  return res.status === 200;
}

export function getErrorDetail(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Uint8Array) {
    const decoded = new TextDecoder().decode(value).trim();
    if (decoded.length === 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(decoded) as unknown;
      return getErrorDetail(parsed) ?? decoded;
    } catch {
      return decoded;
    }
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const message = record.message;
    if (typeof message === "string") {
      return message;
    }
    const detail = record.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (detail && typeof detail === "object") {
      const nested = detail as Record<string, unknown>;
      const nestedMessage = nested.message;
      if (typeof nestedMessage === "string") {
        return nestedMessage;
      }
      const nestedDetail = nested.detail;
      if (typeof nestedDetail === "string") {
        return nestedDetail;
      }
    }
  }
  return null;
}

export function getErrorCode(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Uint8Array) {
    const decoded = new TextDecoder().decode(value).trim();
    if (decoded.length === 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(decoded) as unknown;
      return getErrorCode(parsed);
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const errorCode = record.errorCode;
    if (typeof errorCode === "string" && errorCode.trim().length > 0) {
      return errorCode;
    }
    const detail = record.detail;
    if (detail && typeof detail === "object") {
      const nested = detail as Record<string, unknown>;
      const nestedErrorCode = nested.errorCode;
      if (
        typeof nestedErrorCode === "string" &&
        nestedErrorCode.trim().length > 0
      ) {
        return nestedErrorCode;
      }
    }
  }
  return null;
}

export function resolveEndpointOrigin(address: string): EndpointOriginPolicy {
  return resolveEndpointOriginForMode(address, useServerMode.getState().mode);
}

function resolveBackendUrl(address: string): string {
  const originPolicy = resolveEndpointOrigin(address);
  if (originPolicy === "backend-origin") {
    return `${C_ADDRESSES.BACKEND_ORIGIN}${address}`;
  }
  if (originPolicy === "launcher") {
    return `${C_ADDRESSES.LAUNCHER}${address}`;
  }
  return `${C_ADDRESSES.BACKEND}${address}`;
}

function buildShareSessionHeaders(): Record<string, string> {
  const shareSession = useShareSession.getState();
  if (!shareSession.isDeploymentMode || !shareSession.shareSessionId) {
    return {};
  }
  return { "X-Share-Session-Id": shareSession.shareSessionId };
}

async function parseResponse<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204) {
    return undefined;
  }
  const contentType = response.headers.get("content-type") ?? "";
  const isJson =
    contentType.includes("application/json") || contentType.includes("+json");
  if (isJson) {
    return (await response.json()) as T;
  }
  const isText =
    contentType.startsWith("text/") || contentType.includes("charset=");
  if (!contentType || isText) {
    return (await response.text()) as T;
  }
  return new Uint8Array(await response.arrayBuffer()) as T;
}

async function parseBinaryResponse(
  response: Response,
): Promise<unknown | undefined> {
  if (response.status === 204) {
    return undefined;
  }
  if (response.ok) {
    return new Uint8Array(await response.arrayBuffer());
  }
  return await parseResponse<unknown>(response);
}

export function replaceAddressParams(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!addressParams) return address;

  let output = address;
  for (const [key, value] of Object.entries(addressParams)) {
    const regex = new RegExp(`\\{${key}\\}`, "g");
    output = output.replace(regex, String(value));
  }
  return output;
}

function buildAddressWithParams(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!addressParams) {
    return address;
  }

  const pathParamMatches = Array.from(address.matchAll(/\{([^}]+)\}/g));
  const pathParamKeys = new Set(pathParamMatches.map((match) => match[1]));
  const pathParams: Record<
    string,
    string | number | boolean | null | undefined
  > = {};
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(addressParams)) {
    if (pathParamKeys.has(key)) {
      pathParams[key] = value;
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    queryParams.append(key, String(value));
  }

  const pathAddress = replaceAddressParams(address, pathParams);
  const encodedQuery = queryParams.toString();
  if (encodedQuery.length === 0) {
    return pathAddress;
  }
  const joiner = pathAddress.includes("?") ? "&" : "?";
  return `${pathAddress}${joiner}${encodedQuery}`;
}

export async function get<T>(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): Promise<ResponseDataAndStatus<T>> {
  const fullAddress = buildAddressWithParams(address, addressParams);
  try {
    const shareHeaders = buildShareSessionHeaders();
    const response = await fetch(resolveBackendUrl(fullAddress), {
      credentials: "include",
      headers: shareHeaders,
    });
    return {
      data: await parseResponse<T>(response),
      status: response.status,
      hasResponse: true,
    };
  } catch (error) {
    console.error("GET error:", error);
    return { data: undefined, status: undefined, hasResponse: false };
  }
}

export async function getBinary(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): Promise<ResponseDataAndStatus<Uint8Array>> {
  const fullAddress = buildAddressWithParams(address, addressParams);
  try {
    const shareHeaders = buildShareSessionHeaders();
    const response = await fetch(resolveBackendUrl(fullAddress), {
      credentials: "include",
      headers: shareHeaders,
    });
    const parsed = await parseBinaryResponse(response);
    return {
      data: parsed as Uint8Array | undefined,
      status: response.status,
      hasResponse: true,
    };
  } catch (error) {
    console.error("GET error:", error);
    return { data: undefined, status: undefined, hasResponse: false };
  }
}

export async function post<T>(
  address: string,
  body: unknown | null = null,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): Promise<ResponseDataAndStatus<T>> {
  const fullAddress = buildAddressWithParams(address, addressParams);
  const shouldLogPost = shouldLogDebugPost(fullAddress);
  try {
    const shareHeaders = buildShareSessionHeaders();
    const isFormData = body instanceof FormData;
    let requestBody: BodyInit | null = null;
    if (body !== null) {
      requestBody = isFormData ? body : JSON.stringify(body);
    }
    if (shouldLogPost) {
      logEndpointPostDebug("request", {
        address,
        fullAddress,
        body,
        addressParams,
        shareHeaders,
        isFormData,
      });
    }
    const response = await fetch(resolveBackendUrl(fullAddress), {
      method: "POST",
      credentials: "include",
      headers: isFormData
        ? shareHeaders
        : {
            "Content-Type": "application/json",
            ...shareHeaders,
          },
      body: requestBody,
    });
    const data = await parseResponse<T>(response);
    if (shouldLogPost) {
      logEndpointPostDebug("response", {
        address,
        fullAddress,
        body,
        status: response.status,
        hasResponse: true,
        data,
      });
    }
    return {
      data,
      status: response.status,
      hasResponse: true,
    };
  } catch (error) {
    if (shouldLogPost) {
      logEndpointPostDebug("error", {
        address,
        fullAddress,
        body,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
      });
    }
    console.error("POST error:", error);
    return { data: undefined, status: undefined, hasResponse: false };
  }
}
