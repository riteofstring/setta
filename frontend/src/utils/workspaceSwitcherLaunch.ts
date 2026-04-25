import { safeSessionStorage } from "@setta/app-subsystem-frontend-sdk";
import type { HttpapiLaunchRequest as LaunchRequest } from "openapi/http";
import { HOME_ROUTER_PATH } from "utils/constants";
import { BootstrapProtocol } from "utils/generatedTypes";

export type PendingWorkspaceLaunch = {
  request: LaunchRequest;
  returnUrl: string;
  requestedAt: number;
  sshTarget?: string | null;
  settaFilesLocation?: string | null;
};

const PENDING_LAUNCH_STORAGE_KEY = "setta.pendingWorkspaceLaunch";
const SWITCHER_DRAFT_STORAGE_KEY = "setta.workspaceSwitcherDraft";
const OPEN_SWITCHER_ON_LOAD_KEY = "setta.openWorkspaceSwitcherOnLoad";
const LEGACY_PENDING_LAUNCH_PAYLOAD_HASH_KEY = "pl";
const LEGACY_PENDING_LAUNCH_RETURN_URL_HASH_KEY = "plr";
const PENDING_LAUNCH_INTENT_HASH_KEY = "plt";
const PENDING_LAUNCH_REQUESTED_AT_HASH_KEY = "pla";
const INVALID_OPTIONAL_STRING = Symbol("invalidOptionalString");

function asObjectRecord(candidate: unknown): Record<string, unknown> | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return candidate as Record<string, unknown>;
}

function parseRequiredNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim() ? value : null;
}

function parseRequiredNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function parseOptionalNullableString(
  value: unknown,
): string | null | undefined | typeof INVALID_OPTIONAL_STRING {
  if (value === undefined || value === null || typeof value === "string") {
    return value;
  }
  return INVALID_OPTIONAL_STRING;
}

function parsePendingWorkspaceLaunch(
  candidate: unknown,
): PendingWorkspaceLaunch | null {
  const record = asObjectRecord(candidate);
  if (!record) {
    return null;
  }
  const request = asObjectRecord(record.request);
  const returnUrl = parseRequiredNonEmptyString(record.returnUrl);
  const requestedAt = parseRequiredNumber(record.requestedAt);
  const sshTarget = parseOptionalNullableString(record.sshTarget);
  const settaFilesLocation = parseOptionalNullableString(
    record.settaFilesLocation,
  );
  if (!request || !returnUrl || requestedAt === null) {
    return null;
  }
  if (
    sshTarget === INVALID_OPTIONAL_STRING ||
    settaFilesLocation === INVALID_OPTIONAL_STRING
  ) {
    return null;
  }
  return {
    request: request as LaunchRequest,
    returnUrl,
    requestedAt,
    sshTarget: sshTarget ?? null,
    settaFilesLocation: settaFilesLocation ?? null,
  };
}

function parseRequestedAt(raw: string | null): number {
  if (!raw) {
    return Date.now();
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return Date.now();
  }
  return parsed;
}

function cleanPendingWorkspaceLaunchParams(params: URLSearchParams): void {
  params.delete(LEGACY_PENDING_LAUNCH_PAYLOAD_HASH_KEY);
  params.delete(LEGACY_PENDING_LAUNCH_RETURN_URL_HASH_KEY);
  params.delete(PENDING_LAUNCH_INTENT_HASH_KEY);
  params.delete(PENDING_LAUNCH_REQUESTED_AT_HASH_KEY);
}

function hasPendingWorkspaceLaunchParams(params: URLSearchParams): boolean {
  return (
    params.has(LEGACY_PENDING_LAUNCH_PAYLOAD_HASH_KEY) ||
    params.has(LEGACY_PENDING_LAUNCH_RETURN_URL_HASH_KEY) ||
    params.has(PENDING_LAUNCH_INTENT_HASH_KEY) ||
    params.has(PENDING_LAUNCH_REQUESTED_AT_HASH_KEY)
  );
}

function getDefaultLaunchReturnUrl(): string {
  if (typeof window === "undefined") {
    return HOME_ROUTER_PATH;
  }
  try {
    return new URL(HOME_ROUTER_PATH, window.location.href).toString();
  } catch {
    return HOME_ROUTER_PATH;
  }
}

function replaceCurrentUrl(nextUrl: string, warningContext: string): void {
  try {
    window.history.replaceState(window.history.state, "", nextUrl);
    return;
  } catch {
    // Some browsers/extensions can leave a non-cloneable state in history.state.
  }
  try {
    window.history.replaceState(null, "", nextUrl);
    return;
  } catch (error) {
    console.warn(warningContext, error);
    try {
      window.location.replace(nextUrl);
    } catch {
      // ignore
    }
  }
}

function replaceCurrentUrlHash(params: URLSearchParams): void {
  try {
    const url = new URL(window.location.href);
    url.hash = params.toString();
    replaceCurrentUrl(
      url.toString(),
      "Failed to clean pending workspace launch URL hash",
    );
  } catch (error) {
    console.warn("Failed to clean pending workspace launch URL hash", error);
  }
}

function consumePendingWorkspaceLaunchFromUrlHash(): PendingWorkspaceLaunch | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!hash) {
      return null;
    }
    const params = new URLSearchParams(hash);
    if (!hasPendingWorkspaceLaunchParams(params)) {
      return null;
    }
    const launchIntentToken = params
      .get(PENDING_LAUNCH_INTENT_HASH_KEY)
      ?.trim();
    const requestedAt = parseRequestedAt(
      params.get(PENDING_LAUNCH_REQUESTED_AT_HASH_KEY),
    );
    cleanPendingWorkspaceLaunchParams(params);
    replaceCurrentUrlHash(params);
    if (!launchIntentToken) {
      return null;
    }

    return {
      request: {
        launchIntentToken,
      } as LaunchRequest,
      returnUrl: getDefaultLaunchReturnUrl(),
      requestedAt,
    };
  } catch (error) {
    console.warn("Failed to read pending workspace launch URL hash", error);
    return null;
  }
}

export function writeWorkspaceSwitcherDraft(request: LaunchRequest): void {
  const storage = safeSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(SWITCHER_DRAFT_STORAGE_KEY, JSON.stringify(request));
  } catch (error) {
    console.warn("Failed to store workspace switcher draft", error);
  }
}

export function readWorkspaceSwitcherDraft(): LaunchRequest | null {
  const storage = safeSessionStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(SWITCHER_DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as LaunchRequest;
  } catch (error) {
    console.warn("Failed to read workspace switcher draft", error);
    return null;
  }
}

export function writePendingWorkspaceLaunch(
  pending: PendingWorkspaceLaunch,
): void {
  const storage = safeSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(PENDING_LAUNCH_STORAGE_KEY, JSON.stringify(pending));
  } catch (error) {
    console.warn("Failed to store pending workspace launch", error);
  }
}

export function readPendingWorkspaceLaunch(): PendingWorkspaceLaunch | null {
  const fromUrl = consumePendingWorkspaceLaunchFromUrlHash();
  if (fromUrl) {
    writePendingWorkspaceLaunch(fromUrl);
    return fromUrl;
  }

  const storage = safeSessionStorage();
  if (storage) {
    try {
      const raw = storage.getItem(PENDING_LAUNCH_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const pending = parsePendingWorkspaceLaunch(parsed);
        if (pending) {
          return pending;
        }
      }
    } catch (error) {
      console.warn("Failed to read pending workspace launch", error);
    }
  }

  return null;
}

export function clearPendingWorkspaceLaunch(): void {
  const storage = safeSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(PENDING_LAUNCH_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear pending workspace launch", error);
  }
}

export function requestOpenWorkspaceSwitcherOnNextMount(): void {
  const storage = safeSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(OPEN_SWITCHER_ON_LOAD_KEY, "1");
  } catch (error) {
    console.warn("Failed to request opening workspace switcher", error);
  }
}

export function consumeOpenWorkspaceSwitcherRequest(): boolean {
  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      const raw = url.searchParams.get(
        BootstrapProtocol.openWorkspaceSwitcherQueryParam,
      );
      if (raw) {
        url.searchParams.delete(
          BootstrapProtocol.openWorkspaceSwitcherQueryParam,
        );
        replaceCurrentUrl(
          url.toString(),
          "Failed to consume workspace switcher request from URL",
        );
        return raw === "1" || raw.toLowerCase() === "true";
      }
    } catch (error) {
      console.warn(
        "Failed to consume workspace switcher request from URL",
        error,
      );
    }
  }

  const storage = safeSessionStorage();
  if (!storage) {
    return false;
  }
  try {
    const raw = storage.getItem(OPEN_SWITCHER_ON_LOAD_KEY);
    if (!raw) {
      return false;
    }
    storage.removeItem(OPEN_SWITCHER_ON_LOAD_KEY);
    return raw === "1" || raw.toLowerCase() === "true";
  } catch (error) {
    console.warn("Failed to consume workspace switcher request", error);
    return false;
  }
}
