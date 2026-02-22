import { HOME_ROUTER_PATH } from "utils/constants";
import type { LaunchRequestInput } from "utils/generatedTypes";
import { safeSessionStorage } from "utils/storage";

type PendingWorkspaceLaunch = {
  request: LaunchRequestInput;
  returnUrl: string;
  requestedAt: number;
};

const PENDING_LAUNCH_STORAGE_KEY = "setta.pendingWorkspaceLaunch";
const SWITCHER_DRAFT_STORAGE_KEY = "setta.workspaceSwitcherDraft";
const OPEN_SWITCHER_ON_LOAD_KEY = "setta.openWorkspaceSwitcherOnLoad";
const OPEN_SWITCHER_QUERY_PARAM = "__setta_open_workspace_switcher";
const PENDING_LAUNCH_INTENT_HASH_KEY = "plt";
const PENDING_LAUNCH_RETURN_URL_HASH_KEY = "plr";
const PENDING_LAUNCH_REQUESTED_AT_HASH_KEY = "pla";
const LEGACY_PENDING_LAUNCH_HASH_KEY = "pl";

function parsePendingWorkspaceLaunch(
  candidate: unknown,
): PendingWorkspaceLaunch | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const record = candidate as {
    request?: unknown;
    returnUrl?: unknown;
    requestedAt?: unknown;
  };
  if (!record.request || typeof record.request !== "object") {
    return null;
  }
  if (typeof record.returnUrl !== "string" || !record.returnUrl.trim()) {
    return null;
  }
  if (typeof record.requestedAt !== "number") {
    return null;
  }
  return {
    request: record.request as LaunchRequestInput,
    returnUrl: record.returnUrl,
    requestedAt: record.requestedAt,
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
  params.delete(PENDING_LAUNCH_INTENT_HASH_KEY);
  params.delete(PENDING_LAUNCH_RETURN_URL_HASH_KEY);
  params.delete(PENDING_LAUNCH_REQUESTED_AT_HASH_KEY);
  params.delete(LEGACY_PENDING_LAUNCH_HASH_KEY);
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

function replaceCurrentUrlHash(params: URLSearchParams): void {
  try {
    const url = new URL(window.location.href);
    url.hash = params.toString();
    const nextUrl = url.toString();
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
      console.warn("Failed to clean pending workspace launch URL hash", error);
      try {
        window.location.replace(nextUrl);
      } catch {
        // ignore
      }
    }
  } catch (error) {
    console.warn("Failed to clean pending workspace launch URL hash", error);
  }
}

export function buildWorkspaceLaunchIntentHash({
  launchIntentToken,
  requestedAt,
}: {
  launchIntentToken: string;
  requestedAt: number;
}): string {
  const params = new URLSearchParams();
  params.set(PENDING_LAUNCH_INTENT_HASH_KEY, launchIntentToken);
  params.set(PENDING_LAUNCH_REQUESTED_AT_HASH_KEY, String(requestedAt));
  return params.toString();
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
    const launchIntentToken = params
      .get(PENDING_LAUNCH_INTENT_HASH_KEY)
      ?.trim();
    const hasLegacyPayload = params.has(LEGACY_PENDING_LAUNCH_HASH_KEY);
    if (!launchIntentToken) {
      if (hasLegacyPayload) {
        cleanPendingWorkspaceLaunchParams(params);
        replaceCurrentUrlHash(params);
      }
      return null;
    }

    const pending: PendingWorkspaceLaunch = {
      request: {
        launchIntentToken,
      } as LaunchRequestInput,
      returnUrl: getDefaultLaunchReturnUrl(),
      requestedAt: parseRequestedAt(
        params.get(PENDING_LAUNCH_REQUESTED_AT_HASH_KEY),
      ),
    };
    cleanPendingWorkspaceLaunchParams(params);
    replaceCurrentUrlHash(params);
    return pending;
  } catch (error) {
    console.warn("Failed to read pending workspace launch URL hash", error);
    return null;
  }
}

export function writeWorkspaceSwitcherDraft(request: LaunchRequestInput): void {
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

export function readWorkspaceSwitcherDraft(): LaunchRequestInput | null {
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
    return parsed as LaunchRequestInput;
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
      const raw = url.searchParams.get(OPEN_SWITCHER_QUERY_PARAM);
      if (raw) {
        url.searchParams.delete(OPEN_SWITCHER_QUERY_PARAM);
        window.history.replaceState(window.history.state, "", url.toString());
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
