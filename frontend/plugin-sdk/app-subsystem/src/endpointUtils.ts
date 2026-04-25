import type { ResponseDataAndStatus } from "./requestTransport";

export type { ResponseDataAndStatus } from "./requestTransport";
export function res200<T>(
  res: ResponseDataAndStatus<T>,
): res is ResponseDataAndStatus<T> & { data: T; status: number } {
  return res.status === 200;
}

const ERROR_DETAIL_PATHS = [
  ["message"],
  ["detail"],
  ["detail", "message"],
  ["detail", "detail"],
  ["error", "message"],
  ["error", "detail"],
] as const;

const ERROR_CODE_PATHS = [
  ["errorCode"],
  ["error", "code"],
  ["error", "errorCode"],
  ["detail", "errorCode"],
] as const;

type NormalizedErrorPayload = {
  payload: unknown;
  decodedText: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function normalizeErrorPayload(value: unknown): NormalizedErrorPayload {
  if (!value) {
    return { payload: null, decodedText: null };
  }
  if (!(value instanceof Uint8Array)) {
    return { payload: value, decodedText: null };
  }

  const decodedText = new TextDecoder().decode(value).trim();
  if (decodedText.length === 0) {
    return { payload: null, decodedText: null };
  }
  try {
    return { payload: JSON.parse(decodedText) as unknown, decodedText };
  } catch {
    return { payload: null, decodedText };
  }
}

function getValueAtPath(
  value: unknown,
  path: readonly string[],
): unknown | null {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[segment];
  }
  return current;
}

function getStringAtPath(
  value: unknown,
  path: readonly string[],
  requireNonEmpty: boolean,
): string | null {
  const candidate = getValueAtPath(value, path);
  if (typeof candidate !== "string") {
    return null;
  }
  if (requireNonEmpty && candidate.trim().length === 0) {
    return null;
  }
  return candidate;
}

function findStringAtPaths(
  value: unknown,
  paths: readonly (readonly string[])[],
  requireNonEmpty: boolean,
): string | null {
  for (const path of paths) {
    const candidate = getStringAtPath(value, path, requireNonEmpty);
    if (candidate !== null) {
      return candidate;
    }
  }
  return null;
}

export function getErrorDetail(value: unknown): string | null {
  const { payload, decodedText } = normalizeErrorPayload(value);
  if (typeof payload === "string") {
    return payload;
  }
  return findStringAtPaths(payload, ERROR_DETAIL_PATHS, false) ?? decodedText;
}

export function getErrorCode(value: unknown): string | null {
  const { payload } = normalizeErrorPayload(value);
  return findStringAtPaths(payload, ERROR_CODE_PATHS, true);
}
