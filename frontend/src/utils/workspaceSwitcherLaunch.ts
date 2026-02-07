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
const PENDING_LAUNCH_HASH_KEY = "pl";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.slice(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let idx = 0; idx < binary.length; idx++) {
    bytes[idx] = binary.charCodeAt(idx);
  }
  return bytes;
}

function parsePendingWorkspaceLaunch(candidate: unknown): PendingWorkspaceLaunch | null {
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

export function encodePendingWorkspaceLaunchForUrlHash(
  pending: PendingWorkspaceLaunch,
): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const json = JSON.stringify(pending);
    const encoder = new TextEncoder();
    return toBase64Url(encoder.encode(json));
  } catch (error) {
    console.warn("Failed to encode pending workspace launch for URL hash", error);
    return null;
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
    const encoded = params.get(PENDING_LAUNCH_HASH_KEY);
    if (!encoded) {
      return null;
    }
    const bytes = fromBase64Url(encoded);
    const decoded = new TextDecoder().decode(bytes);
    const pending = parsePendingWorkspaceLaunch(JSON.parse(decoded));
    params.delete(PENDING_LAUNCH_HASH_KEY);
    window.location.hash = params.toString();
    return pending;
  } catch (error) {
    console.warn("Failed to decode pending workspace launch from URL hash", error);
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

  const fromUrl = consumePendingWorkspaceLaunchFromUrlHash();
  if (!fromUrl) {
    return null;
  }
  writePendingWorkspaceLaunch(fromUrl);
  return fromUrl;
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
      console.warn("Failed to consume workspace switcher request from URL", error);
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
