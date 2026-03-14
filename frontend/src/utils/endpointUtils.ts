import { useShareSession } from "state/definitions";
import { ENDPOINT_ORIGIN_POLICY } from "./serverModeBoundaryPolicy";
import {
  buildBackendURL,
  replaceAddressParams,
  resolveEndpointOrigin,
} from "./transportUrlCore";

export {
  buildBackendURL,
  ENDPOINT_ORIGIN_POLICY,
  replaceAddressParams,
  resolveEndpointOrigin,
};

export type ResponseDataAndStatus<T> = {
  data: T | undefined;
  status: number | undefined;
  hasResponse: boolean;
};

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
    const error = record.error;
    if (error && typeof error === "object") {
      const nested = error as Record<string, unknown>;
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
    const error = record.error;
    if (error && typeof error === "object") {
      const nested = error as Record<string, unknown>;
      const nestedCode = nested.code ?? nested.errorCode;
      if (typeof nestedCode === "string" && nestedCode.trim().length > 0) {
        return nestedCode;
      }
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

export async function get<T>(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): Promise<ResponseDataAndStatus<T>> {
  try {
    const shareHeaders = buildShareSessionHeaders();
    const response = await fetch(buildBackendURL(address, addressParams), {
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
  try {
    const shareHeaders = buildShareSessionHeaders();
    const response = await fetch(buildBackendURL(address, addressParams), {
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
  try {
    const shareHeaders = buildShareSessionHeaders();
    const isFormData = body instanceof FormData;
    let requestBody: BodyInit | null = null;
    if (body !== null) {
      requestBody = isFormData ? body : JSON.stringify(body);
    }
    const response = await fetch(buildBackendURL(address, addressParams), {
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
    return {
      data: await parseResponse<T>(response),
      status: response.status,
      hasResponse: true,
    };
  } catch (error) {
    console.error("POST error:", error);
    return { data: undefined, status: undefined, hasResponse: false };
  }
}
