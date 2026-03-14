import type { ResponseDataAndStatus } from "./requestTransport";
import { ENDPOINT_ORIGIN_POLICY } from "./serverModeBoundaryPolicy";
import {
  buildBackendURL,
  replaceAddressParams,
  resolveEndpointOrigin,
} from "./transportUrlCore";

export type { ResponseDataAndStatus } from "./requestTransport";
export {
  buildBackendURL,
  ENDPOINT_ORIGIN_POLICY,
  replaceAddressParams,
  resolveEndpointOrigin,
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
