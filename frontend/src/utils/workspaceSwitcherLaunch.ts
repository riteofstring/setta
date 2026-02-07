import type { LaunchRequestInput } from "utils/generatedTypes";

export type PendingWorkspaceLaunch = {
  request: LaunchRequestInput;
  returnPath: string;
  requestedAt: number;
};

const PENDING_LAUNCH_STORAGE_KEY = "setta.pendingWorkspaceLaunch";
const SWITCHER_DRAFT_STORAGE_KEY = "setta.workspaceSwitcherDraft";
const OPEN_SWITCHER_ON_LOAD_KEY = "setta.openWorkspaceSwitcherOnLoad";

function resolveSessionStorage(): Storage | undefined {
  if (typeof sessionStorage !== "undefined") {
    return sessionStorage;
  }
  if (typeof window === "undefined") {
    return undefined;
  }
  if (typeof window.sessionStorage === "undefined") {
    return undefined;
  }
  return window.sessionStorage;
}

export function writeWorkspaceSwitcherDraft(request: LaunchRequestInput): void {
  const storage = resolveSessionStorage();
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
  const storage = resolveSessionStorage();
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
  const storage = resolveSessionStorage();
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
  const storage = resolveSessionStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(PENDING_LAUNCH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as {
      request?: unknown;
      returnPath?: unknown;
      requestedAt?: unknown;
    };
    if (!record.request || typeof record.request !== "object") {
      return null;
    }
    if (typeof record.returnPath !== "string") {
      return null;
    }
    if (typeof record.requestedAt !== "number") {
      return null;
    }
    return {
      request: record.request as LaunchRequestInput,
      returnPath: record.returnPath,
      requestedAt: record.requestedAt,
    };
  } catch (error) {
    console.warn("Failed to read pending workspace launch", error);
    return null;
  }
}

export function clearPendingWorkspaceLaunch(): void {
  const storage = resolveSessionStorage();
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
  const storage = resolveSessionStorage();
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
  const storage = resolveSessionStorage();
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
